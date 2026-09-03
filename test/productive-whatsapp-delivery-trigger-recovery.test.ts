import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createWhatsAppDeliveryRecoveryHandler,
  deliveryRecoveryTokenMatches,
} from "@/lib/server/whatsapp/delivery-recovery-handler";
import type { RecoverableDelivery } from "@/lib/server/whatsapp/outbound-delivery";
import { runImmediateWhatsAppDelivery } from "@/lib/server/whatsapp/ingestion";
import type { RecoverableWhatsAppDeliveryDependencies, RecoverableWhatsAppDeliveryWork } from "@/lib/server/whatsapp/recoverable-delivery-runner";

const uuid = (n: number) => `e4000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = (token = "secret") => new Request("https://example.invalid/api/internal/whatsapp/deliveries/recovery", {
  method: "POST", headers: { authorization: `Bearer ${token}` },
});
const item = (n: number, recovery_action: RecoverableDelivery["recovery_action"] = "SAFE_TO_RUN"): RecoverableDelivery => ({
  delivery_command_id: uuid(n), outbound_message_id: uuid(n + 10), recovery_action,
});
const runnerDependencies = {} as RecoverableWhatsAppDeliveryDependencies;

describe("AP-16-06-04E delivery recovery route", () => {
  it("awaits exactly one immediate delivery with the completed result identity", async () => {
    let release: (() => void) | undefined;
    const deliver = vi.fn(() => new Promise<{status:"sent"}>(resolve => { release = () => resolve({status:"sent"}); }));
    let settled = false;
    const pending = runImmediateWhatsAppDelivery(
      {kind:"completed", outbound_message_id:uuid(9)}, 1_000,
      {now:()=>41_000, deliver, createDeliveryDependencies:()=>runnerDependencies},
    ).then(() => { settled = true; });
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledWith({outbound_message_id:uuid(9)}, runnerDependencies));
    expect(deliver).toHaveBeenCalledOnce(); expect(settled).toBe(false);
    release?.(); await pending; expect(settled).toBe(true);
  });

  it.each(["human_review", "failed", "busy", "stale", "ownership_lost", "already_terminal"] as const)("does not deliver cycle result %s", async (kind) => {
    const deliver = vi.fn();
    await runImmediateWhatsAppDelivery({kind}, 0, {now:()=>0, deliver, createDeliveryDependencies:()=>runnerDependencies});
    expect(deliver).not.toHaveBeenCalled();
  });

  it("does not invent an identity or start below the twenty-second remaining budget", async () => {
    const deliver = vi.fn(); const factory = vi.fn(() => runnerDependencies);
    await runImmediateWhatsAppDelivery({kind:"completed"}, 0, {now:()=>0, deliver, createDeliveryDependencies:factory});
    await runImmediateWhatsAppDelivery({kind:"completed",outbound_message_id:uuid(9)}, 0, {now:()=>40_001, deliver, createDeliveryDependencies:factory});
    expect(deliver).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
  });

  it("contains unexpected immediate delivery exceptions at the transport handoff", async () => {
    await expect(runImmediateWhatsAppDelivery({kind:"completed",outbound_message_id:uuid(9)}, 0, {
      now:()=>0, deliver:vi.fn().mockRejectedValue(new Error("private")), createDeliveryDependencies:()=>runnerDependencies,
    })).resolves.toBeUndefined();
  });

  it.each([undefined, "", "   "])("fails closed on absent/empty configuration (%s)", async (configured) => {
    const discover = vi.fn(); const run = vi.fn(); const factory = vi.fn();
    const response = await createWhatsAppDeliveryRecoveryHandler({ getSecret: () => configured, discover, run, createRunnerDependencies: factory })(request());
    expect(response.status).toBe(503); expect(discover).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
  });

  it.each([null, "Basic secret", "Bearer", "Bearer wrong", "Bearer secret, Bearer secret", "Bearer secret extra"])("rejects invalid auth %s before work", async (header) => {
    const discover = vi.fn(); const run = vi.fn(); const factory = vi.fn();
    const req = new Request("https://example.invalid", { method: "POST", ...(header ? { headers: { authorization: header } } : {}) });
    const response = await createWhatsAppDeliveryRecoveryHandler({ getSecret: () => "secret", discover, run, createRunnerDependencies: factory })(req);
    expect(response.status).toBe(401); expect(discover).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
  });

  it("uses SHA-256/timingSafeEqual bearer matching and exactly one bounded discovery", async () => {
    const discover = vi.fn().mockResolvedValue([]); const factory = vi.fn(() => runnerDependencies);
    const response = await createWhatsAppDeliveryRecoveryHandler({ getSecret: () => "secret", discover, createRunnerDependencies: factory })(request());
    expect(response.status).toBe(200); expect(discover).toHaveBeenCalledOnce(); expect(discover).toHaveBeenCalledWith(5); expect(factory).toHaveBeenCalledOnce();
    expect(deliveryRecoveryTokenMatches("Bearer secret", "secret")).toBe(true);
    const source = await readFile("lib/server/whatsapp/delivery-recovery-handler.ts", "utf8");
    expect(source).toContain('createHash("sha256")'); expect(source).toContain("timingSafeEqual"); expect(source).not.toContain("Promise.all"); expect(source).not.toContain("Promise.race");
  });

  it("maps authoritative identities and processes sequentially with isolated failures", async () => {
    const items = [item(1), item(2, "FINALIZE_AMBIGUOUS"), item(3)];
    let active = 0; let maximum = 0;
    const run = vi.fn(async (_work: RecoverableWhatsAppDeliveryWork) => {
      active += 1; maximum = Math.max(maximum, active); active -= 1;
      if (run.mock.calls.length === 1) throw new Error("private provider detail");
      return run.mock.calls.length === 2 ? { status: "ambiguous" as const } : { status: "sent" as const };
    });
    const response = await createWhatsAppDeliveryRecoveryHandler({ getSecret:()=>"secret", discover:vi.fn().mockResolvedValue(items), createRunnerDependencies:()=>runnerDependencies, run })(request());
    expect(run.mock.calls.map(([work]) => work)).toEqual([
      { recovery_action:"SAFE_TO_RUN", outbound_message_id:uuid(11) },
      { recovery_action:"FINALIZE_AMBIGUOUS", delivery_command_id:uuid(2) },
      { recovery_action:"SAFE_TO_RUN", outbound_message_id:uuid(13) },
    ]);
    expect(maximum).toBe(1);
    expect(await response.json()).toMatchObject({ discovered:3, attempted:3, unexpected_error:1, ambiguous:1, sent:1, budget_exhausted:0 });
  });

  it("does not start remaining items at 35 seconds and counts all unstarted rows", async () => {
    const run = vi.fn().mockResolvedValue({status:"sent"});
    const times = [0, 34_999, 35_000];
    const discover = vi.fn().mockResolvedValue([item(1), item(2), item(3)]);
    const response = await createWhatsAppDeliveryRecoveryHandler({ getSecret:()=>"secret", discover, createRunnerDependencies:()=>runnerDependencies, run, now:()=>times.shift() ?? 35_000 })(request());
    expect(run).toHaveBeenCalledOnce(); expect(discover).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ discovered:3, attempted:1, sent:1, budget_exhausted:2 });
  });

  it("keeps route and scheduler contracts content-free and separate", async () => {
    const route = await readFile("app/api/internal/whatsapp/deliveries/recovery/route.ts", "utf8");
    const migration = await readFile("supabase/migrations/202609030002_productive_whatsapp_delivery_recovery.sql", "utf8");
    expect(route).toContain('runtime = "nodejs"'); expect(route).toContain("maxDuration = 60"); expect(route).not.toMatch(/export const GET/);
    expect(migration).toContain("'whatsapp-delivery-recovery'"); expect(migration).toContain("'* * * * *'"); expect(migration).toContain("net.http_post");
    expect(migration).toContain("KLIMAGUY_PRODUCTION_BASE_URL"); expect(migration).toContain("WHATSAPP_DELIVERY_RECOVERY_SECRET");
    expect(migration).toContain("/api/internal/whatsapp/deliveries/recovery"); expect(migration).not.toContain("CONVERSATION_CYCLE_RECOVERY_SECRET");
    expect(migration).not.toMatch(/claim_|retry_|dispatch_/);
  });
});
