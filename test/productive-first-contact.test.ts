import { describe, expect, it, vi } from "vitest";
import { runProductiveFirstContactInitialization } from "@/lib/server/conversation/productive-first-contact";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const foundation = { status: "created", conversation_id: uuid(1), customer_id: uuid(2), project_id: uuid(3), conversation_revision: 2, knowledge_state_version: 1, runtime_revision: 1, runtime_status: "idle" } as const;
const prompt = { status: "initialized", conversation_id: uuid(1), project_id: uuid(3), runtime_revision: 2, knowledge_state_version: 1, interaction_id: uuid(4), planner_snapshot_id: uuid(5), outbound_message_id: uuid(6), delivery_command_id: uuid(7) } as const;

describe("productive first-contact orchestration", () => {
  it("awaits foundation, initializes and hands the authoritative id to delivery", async () => {
    const calls: string[] = [];
    const deliver = vi.fn(async (work) => { calls.push(`delivery:${"outbound_message_id" in work ? work.outbound_message_id : "wrong"}`); return { status: "sent" as const }; });
    const result = await runProductiveFirstContactInitialization({ conversation_id: uuid(1), request_started_at: 10, immediate_delivery: true }, {
      foundation: async () => { calls.push("foundation"); return foundation; },
      initializePrompt: async () => { calls.push("prompt"); return prompt; }, deliver,
      createDeliveryDependencies: vi.fn(() => ({} as never)), now: () => 20,
    });
    expect(calls).toEqual(["foundation", "prompt", `delivery:${uuid(6)}`]);
    expect(result).toEqual({ status: "completed", outbound_message_id: uuid(6), delivery: "started" });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("continues after foundation replay and preserves initial-prompt replay identity", async () => {
    const replay = { ...prompt, status: "already_initialized" as const };
    const result = await runProductiveFirstContactInitialization({ conversation_id: uuid(1), immediate_delivery: false }, {
      foundation: async () => ({ ...foundation, status: "already_complete" }), initializePrompt: async () => replay,
    });
    expect(result).toEqual({ status: "already_complete", outbound_message_id: uuid(6), delivery: "not_requested" });
  });

  it.each(["conflict", "actor_unavailable", "actor_invalid", "invalid_state", "persistence_failure"] as const)("stops after foundation %s", async (status) => {
    const initializePrompt = vi.fn();
    expect(await runProductiveFirstContactInitialization({ conversation_id: uuid(1) }, { foundation: async () => ({ status }), initializePrompt })).toEqual({ status: "failed" });
    expect(initializePrompt).not.toHaveBeenCalled();
  });

  it.each([["stale", "stale"], ["already_advanced", "not_applicable"], ["not_applicable", "not_applicable"]] as const)("does not deliver prompt result %s", async (promptStatus, expected) => {
    const deliver = vi.fn();
    const result = await runProductiveFirstContactInitialization({ conversation_id: uuid(1), immediate_delivery: true }, {
      foundation: async () => foundation, initializePrompt: async () => ({ status: promptStatus }), deliver,
    });
    expect(result.status).toBe(expected); expect(deliver).not.toHaveBeenCalled();
  });

  it("defers immediate delivery below the shared 20-second budget", async () => {
    const deliver = vi.fn();
    const result = await runProductiveFirstContactInitialization({ conversation_id: uuid(1), request_started_at: 0, immediate_delivery: true }, {
      foundation: async () => foundation, initializePrompt: async () => prompt, deliver, now: () => 40_001,
    });
    expect(result).toMatchObject({ delivery: "deferred", outbound_message_id: uuid(6) });
    expect(deliver).not.toHaveBeenCalled();
  });
});
