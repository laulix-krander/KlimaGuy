import { describe, expect, it, vi } from "vitest";
import { createFirstContactRecoveryHandler, FIRST_CONTACT_RECOVERY_START_BUDGET_MS, firstContactRecoveryTokenMatches } from "@/lib/server/conversation/first-contact-recovery-handler";
import { FIRST_CONTACT_RECOVERY_BATCH_SIZE } from "@/lib/server/conversation/first-contact-recovery";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = (authorization?: string) => new Request("http://local/api/internal/first-contact/recovery", { method: "POST", headers: authorization ? { authorization } : {} });

describe("first-contact recovery route", () => {
  it.each([undefined, "", "  "])("returns 503 for missing/empty config %s before discovery", async (secret) => {
    const discover = vi.fn();
    expect((await createFirstContactRecoveryHandler({ getSecret: () => secret, discover })(request())).status).toBe(503);
    expect(discover).not.toHaveBeenCalled();
  });

  it.each([undefined, "Basic secret", "Bearer", "Bearer a b", "Bearer a,Bearer b", "Bearer wrong"])("returns 401 for invalid authorization %s", async (authorization) => {
    const discover = vi.fn();
    expect((await createFirstContactRecoveryHandler({ getSecret: () => "secret", discover })(request(authorization))).status).toBe(401);
    expect(discover).not.toHaveBeenCalled();
  });

  it("uses digest comparison and performs exactly one bounded discovery", async () => {
    expect(firstContactRecoveryTokenMatches("Bearer secret", "secret")).toBe(true);
    expect(firstContactRecoveryTokenMatches("Bearer wrong", "secret")).toBe(false);
    const discover = vi.fn().mockResolvedValue([{ conversation_id: uuid(1), recovery_action: "FOUNDATION_REQUIRED" }]);
    const run = vi.fn().mockResolvedValue({ status: "completed", outbound_message_id: uuid(2), delivery: "not_requested" });
    const response = await createFirstContactRecoveryHandler({ getSecret: () => "secret", discover, run, now: () => 0 })(request("Bearer secret"));
    expect(discover).toHaveBeenCalledOnce(); expect(discover).toHaveBeenCalledWith(FIRST_CONTACT_RECOVERY_BATCH_SIZE);
    expect(run).toHaveBeenCalledWith({ conversation_id: uuid(1), immediate_delivery: false });
    expect(await response.json()).toEqual({ discovered: 1, completed: 1, already_complete: 0, not_applicable: 0, stale: 0, failed: 0, unexpected_error: 0, budget_exhausted: 0 });
  });

  it("runs sequentially, isolates item failures, and fully awaits started work", async () => {
    let active = 0; let maximum = 0;
    const run = vi.fn(async ({ conversation_id }: { conversation_id: string }) => {
      active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1;
      if (conversation_id === uuid(1)) throw new Error("controlled-test-error");
      return { status: "already_complete" as const, outbound_message_id: uuid(9), delivery: "not_requested" as const };
    });
    const discover = vi.fn().mockResolvedValue([1, 2].map((n) => ({ conversation_id: uuid(n), recovery_action: "FOUNDATION_REQUIRED" as const })));
    const response = await createFirstContactRecoveryHandler({ getSecret: () => "secret", discover, run, now: () => 0 })(request("Bearer secret"));
    expect(maximum).toBe(1); expect(run).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ discovered: 2, already_complete: 1, unexpected_error: 1 });
  });

  it("counts every unstarted item when the monotonic start budget is exhausted", async () => {
    const run = vi.fn(); let tick = 0;
    const discover = vi.fn().mockResolvedValue([1, 2].map((n) => ({ conversation_id: uuid(n), recovery_action: "INITIAL_PROMPT_REQUIRED" as const })));
    const response = await createFirstContactRecoveryHandler({ getSecret: () => "secret", discover, run, now: () => tick++ === 0 ? 0 : FIRST_CONTACT_RECOVERY_START_BUDGET_MS })(request("Bearer secret"));
    expect(run).not.toHaveBeenCalled(); expect(await response.json()).toMatchObject({ budget_exhausted: 2 });
  });
});
