import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/conversation/recoverable-cycle-runner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/conversation/recoverable-cycle-runner")>();
  return {
    ...original,
    discoverRecoverableConversationCycles: vi.fn(),
    runPersistentCustomerMessageCycle: vi.fn(),
  };
});

import {
  discoverRecoverableConversationCycles,
  runPersistentCustomerMessageCycle,
  type RecoverableCycleRunnerResult,
} from "@/lib/server/conversation/recoverable-cycle-runner";
import {
  createConversationCycleRecoveryHandler,
  RECOVERY_BATCH_SIZE,
  RECOVERY_START_BUDGET_MS,
  recoveryTokenMatches,
} from "@/lib/server/conversation/recovery-handler";

const uuid = (n: number) => `a2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = (n: number) => ({ command_id: uuid(n), source_message_id: uuid(n + 20), lease_expired_at: "2026-09-02T12:00:00.000Z" });
const request = (authorization?: string, url = "https://example.invalid/api/internal/conversation-cycles/recovery") =>
  new Request(url, { method: "POST", headers: authorization ? { authorization } : undefined });
const runtime = { discovery: { rpc: vi.fn() }, runner: { claim: { rpc: vi.fn() }, read: { rpc: vi.fn() }, commit: { rpc: vi.fn() } } };

describe("AP-16-06-03 productive recovery", () => {
  beforeEach(() => vi.clearAllMocks());
  it("fails closed before runtime creation and discovery", async () => {
    const createRuntime = vi.fn(() => runtime);
    expect((await createConversationCycleRecoveryHandler({ getSecret: () => undefined, createRuntime })(request())).status).toBe(503);
    expect((await createConversationCycleRecoveryHandler({ getSecret: () => "secret", createRuntime })(request())).status).toBe(401);
    expect((await createConversationCycleRecoveryHandler({ getSecret: () => "secret", createRuntime })(request("Basic secret"))).status).toBe(401);
    expect((await createConversationCycleRecoveryHandler({ getSecret: () => "secret", createRuntime })(request("Bearer wrong"))).status).toBe(401);
    expect(createRuntime).not.toHaveBeenCalled();
    expect(discoverRecoverableConversationCycles).not.toHaveBeenCalled();
  });

  it("accepts only the exact bearer digest contract", () => {
    expect(recoveryTokenMatches("Bearer exact-secret", "exact-secret")).toBe(true);
    expect(recoveryTokenMatches("Bearer exact-secret ", "exact-secret")).toBe(false);
    expect(recoveryTokenMatches("Bearer exact-secret, Bearer other", "exact-secret")).toBe(false);
  });

  it("discovers once with limit ten and processes every result sequentially", async () => {
    const rows = [command(1), command(2), command(3)];
    vi.mocked(discoverRecoverableConversationCycles).mockResolvedValueOnce(rows);
    let active = 0; let maximum = 0;
    vi.mocked(runPersistentCustomerMessageCycle).mockImplementation(async () => {
      active += 1; maximum = Math.max(maximum, active);
      await Promise.resolve(); active -= 1;
      return { kind: "completed" };
    });
    const response = await createConversationCycleRecoveryHandler({ getSecret: () => "secret", createRuntime: () => runtime, now: () => 0 })(request("Bearer secret"));
    expect(response.status).toBe(200);
    expect(discoverRecoverableConversationCycles).toHaveBeenCalledOnce();
    expect(discoverRecoverableConversationCycles).toHaveBeenCalledWith(runtime.discovery, RECOVERY_BATCH_SIZE);
    expect(runPersistentCustomerMessageCycle).toHaveBeenCalledTimes(3);
    expect(vi.mocked(runPersistentCustomerMessageCycle).mock.calls.map((call) => call[1].message_id)).toEqual(rows.map(row => row.source_message_id));
    expect(maximum).toBe(1);
    expect(await response.json()).toMatchObject({ discovered: 3, attempted: 3, completed: 3, budget_exhausted: false });
  });

  it("isolates all controlled results and unexpected exceptions", async () => {
    const kinds: RecoverableCycleRunnerResult["kind"][] = ["completed", "human_review", "failed", "busy", "stale", "ownership_lost", "already_terminal"];
    vi.mocked(discoverRecoverableConversationCycles).mockResolvedValueOnce(kinds.map((_, index) => command(index + 1)).concat(command(9)));
    for (const kind of kinds) vi.mocked(runPersistentCustomerMessageCycle).mockResolvedValueOnce({ kind });
    vi.mocked(runPersistentCustomerMessageCycle).mockRejectedValueOnce(new Error("private detail"));
    const response = await createConversationCycleRecoveryHandler({ getSecret: () => "secret", createRuntime: () => runtime, now: () => 0 })(request("Bearer secret"));
    const body = await response.json();
    expect(body).toEqual({ discovered: 8, attempted: 8, completed: 1, human_review: 1, failed: 1, busy: 1, stale: 1, ownership_lost: 1, already_terminal: 1, unexpected_error: 1, budget_exhausted: false });
    expect(JSON.stringify(body)).not.toContain("private detail");
  });

  it("does not start another command at the 45-second boundary", async () => {
    vi.mocked(discoverRecoverableConversationCycles).mockResolvedValueOnce([command(1), command(2)]);
    vi.mocked(runPersistentCustomerMessageCycle).mockResolvedValue({ kind: "completed" });
    const ticks = [0, RECOVERY_START_BUDGET_MS - 1, RECOVERY_START_BUDGET_MS];
    const response = await createConversationCycleRecoveryHandler({ getSecret: () => "secret", createRuntime: () => runtime, now: () => ticks.shift() ?? RECOVERY_START_BUDGET_MS })(request("Bearer secret"));
    expect(runPersistentCustomerMessageCycle).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ discovered: 2, attempted: 1, budget_exhausted: true });
  });

  it("defines the Node-only route and static Supabase Cron/Vault contract", async () => {
    const route = await readFile("app/api/internal/conversation-cycles/recovery/route.ts", "utf8");
    const migration = await readFile("supabase/migrations/202609020004_productive_conversation_cycle_recovery.sql", "utf8");
    expect(route).toContain('runtime = "nodejs"'); expect(route).toContain("maxDuration = 60"); expect(route).not.toMatch(/export const GET/);
    expect(migration).toContain("'conversation-cycle-recovery'"); expect(migration).toContain("'*/5 * * * *'");
    expect(migration).toContain("net.http_post"); expect(migration).toContain("/api/internal/conversation-cycles/recovery");
    expect(migration).toContain("vault.decrypted_secrets"); expect(migration).toContain("'Authorization', 'Bearer ' || auth_secret.decrypted_secret");
    expect(migration).not.toMatch(/https:\/\/(localhost|[^']*vercel\.app)|my-secret-value|customer_text|message_id|provider/i);
  });

  it("keeps trigger and recovery free of legacy claims, outbound, inference, and direct mutations", async () => {
    const code = await Promise.all(["lib/server/whatsapp/ingestion.ts", "lib/server/conversation/recovery-handler.ts"].map(path => readFile(path, "utf8")));
    const boundaries = code.join("\n");
    expect(boundaries).not.toMatch(/claim_customer_message_cycle|sendWhatsAppText|deliverPendingWhatsAppMessage|graph\.facebook|openai|\bLLM\b|normalizeCustomerAnswer|planNextAction|renderCustomerInteraction|\.from\(/i);
    expect(code[0]).toContain("await runPersistentCustomerMessageCycle(runtime.runner, { message_id })");
    expect(code[1]).not.toMatch(/Promise\.all|setTimeout|setImmediate|Promise\.race/);
  });
});
