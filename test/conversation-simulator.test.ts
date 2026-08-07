import { describe, expect, it } from "vitest";
import { canUseConversationSimulator } from "@/lib/domain/permissions";
import { createSimulatorStart, executeSimulatorAnswer, SIMULATOR_SCENARIOS } from "@/lib/domain/conversation-intelligence";

describe("Internal Conversation Simulator", () => {
  it("ist strikt Admin-only", () => {
    expect(canUseConversationSimulator("admin")).toBe(true);
    expect(canUseConversationSimulator("reviewer")).toBe(false);
    expect(canUseConversationSimulator(null)).toBe(false);
    expect(canUseConversationSimulator("invalid" as never)).toBe(false);
  });

  it("stellt ausschließlich statische synthetische Szenarien einschließlich leerem Start bereit", () => {
    expect(SIMULATOR_SCENARIOS.map(([id]) => id)).toEqual([
      "minimal_room", "unknown_room_area", "contradictory_room_area", "assumption_required",
      "human_review_required", "retry_limit", "level_3_reached", "empty_synthetic_project",
    ]);
    for (const [id] of SIMULATOR_SCENARIOS) {
      const start = createSimulatorStart(id);
      expect(start.project_id).toMatch(/^81000000-/);
      expect(start.interpretation_inputs.rendered_interaction.customer_visible).toBe(true);
    }
    expect(createSimulatorStart("empty_synthetic_project").knowledge_state.claims).toEqual([]);
  });

  it("normalisiert und durchläuft die bestehende Engine deterministisch", () => {
    const first = executeSimulatorAnswer(createSimulatorStart("empty_synthetic_project"), { kind: "text", value: "ca. 25 m²" }, 1);
    const replay = executeSimulatorAnswer(createSimulatorStart("empty_synthetic_project"), { kind: "text", value: "ca. 25 m²" }, 1);
    expect(first.normalized.success).toBe(true);
    expect(first.result?.success).toBe(true);
    expect(first.result).toEqual(replay.result);
    if (first.result?.success) expect(first.result.current_state_version).toBe(2);
  });

  it("bildet Unknown, No-change, Widerspruch, Retry und Human Review kontrolliert ab", () => {
    const unknown = executeSimulatorAnswer(createSimulatorStart("unknown_room_area"), { kind: "option", option_key: "unknown" }, 1);
    expect(unknown.normalized.success && unknown.normalized.normalized_answer.outcome).toBe("unknown");
    expect(unknown.result?.success).toBe(true);
    const contradiction = executeSimulatorAnswer(createSimulatorStart("contradictory_room_area"), { kind: "text", value: "25 m²" }, 1);
    expect(contradiction.result?.success).toBe(true);
    const review = executeSimulatorAnswer(createSimulatorStart("human_review_required"), { kind: "text", value: "25 m²" }, 1);
    expect(review.result).toMatchObject({ success: false, requires_human_review: true });
  });
});
