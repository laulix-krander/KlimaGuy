import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { activeInteractionFor, ConversationSimulator } from "@/app/(app)/admin/intelligence/simulator/simulator-view";
import { canUseConversationSimulator } from "@/lib/domain/permissions";
import { createSimulatorStart, executeSimulatorAnswer, SIMULATOR_SCENARIOS } from "@/lib/domain/conversation-intelligence";

describe("Internal Conversation Simulator", () => {
  afterEach(cleanup);
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

  it("entfernt die beantwortete Leitungswegfrage beim Zwischenstand ohne doppelten Transcript-Eintrag oder weiteren Submit", () => {
    render(createElement(ConversationSimulator));

    for (let step = 0; step < 5; step += 1) {
      const active = screen.getByText("Aktuelle Kundeninteraktion").closest("article");
      expect(active).not.toBeNull();
      if (within(active!).queryByText("Ist ungefähr bekannt, wie die Leitungen vom Innen- zum Außengerät geführt werden könnten?")) break;
      const yes = within(active!).queryByRole("button", { name: "Ja" });
      if (yes) fireEvent.click(yes);
      else {
        const input = within(active!).getByLabelText("Synthetische Antwort");
        fireEvent.change(input, { target: { value: step === 0 ? "ca. 25 m²" : "Wohnzimmer" } });
        fireEvent.click(within(active!).getByRole("button", { name: "Antwort senden" }));
      }
    }

    const route = "Ist ungefähr bekannt, wie die Leitungen vom Innen- zum Außengerät geführt werden könnten?";
    const active = screen.getByText("Aktuelle Kundeninteraktion").closest("article")!;
    expect(within(active).getByText(route)).toBeTruthy();
    fireEvent.click(within(active).getByRole("button", { name: "Ja" }));

    expect(screen.queryByText("Aktuelle Kundeninteraktion")).toBeNull();
    expect(screen.getAllByText(route)).toHaveLength(1);
    expect(screen.getAllByText("Zwischenstand erreicht").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Ja" })).toBeNull();
    expect(screen.queryByLabelText("Synthetische Antwort")).toBeNull();
  });

  it("ersetzt eine beantwortete Frage durch die nächste echte Interaction und protokolliert beide nur einmal", () => {
    render(createElement(ConversationSimulator));
    const first = "Wie groß ist der Raum ungefähr?";
    const active = screen.getByText("Aktuelle Kundeninteraktion").closest("article")!;
    fireEvent.change(within(active).getByLabelText("Synthetische Antwort"), { target: { value: "ca. 25 m²" } });
    fireEvent.click(within(active).getByRole("button", { name: "Antwort senden" }));
    expect(screen.getAllByText(first)).toHaveLength(1);
    expect(screen.getByText("Aktuelle Kundeninteraktion").closest("article")?.textContent).not.toContain(first);
  });

  it("entfernt bei Human Review die alte Interaction und sämtliche Answer Controls", () => {
    render(createElement(ConversationSimulator));
    fireEvent.change(screen.getByLabelText("Szenario"), { target: { value: "human_review_required" } });
    const active = screen.getByText("Aktuelle Kundeninteraktion").closest("article")!;
    fireEvent.change(within(active).getByLabelText("Synthetische Antwort"), { target: { value: "25 m²" } });
    fireEvent.click(within(active).getByRole("button", { name: "Antwort senden" }));
    expect(screen.queryByText("Aktuelle Kundeninteraktion")).toBeNull();
    expect(screen.queryByLabelText("Synthetische Antwort")).toBeNull();
    expect(screen.getAllByText("Fachliche Prüfung erforderlich").length).toBeGreaterThan(0);
  });

  it("validiert Claim, Missing-Information-Neuberechnung und Planner-Stop nach line_route_known", () => {
    let context = createSimulatorStart("empty_synthetic_project");
    let lineRouteResult: ReturnType<typeof executeSimulatorAnswer>["result"];
    for (let cycle = 1; cycle <= 5; cycle += 1) {
      const interaction = context.interpretation_inputs.rendered_interaction;
      const raw = interaction.answer_contract?.answer_type === "boolean" ? { kind: "option" as const, option_key: "yes" } : { kind: "text" as const, value: cycle === 1 ? "ca. 25 m²" : "Wohnzimmer" };
      const execution = executeSimulatorAnswer(context, raw, cycle);
      expect(execution.result?.success).toBe(true);
      if (interaction.template_key === "ask_line_route_known") { lineRouteResult = execution.result; break; }
      expect(execution.next).toBeDefined();
      context = execution.next!;
    }
    expect(lineRouteResult?.success).toBe(true);
    if (!lineRouteResult?.success) return;
    expect(lineRouteResult.knowledge_state.claims.some((claim) => claim.property_key === "line_route_known" && claim.value === true)).toBe(true);
    expect(lineRouteResult.missing_information.some((need) => typeof need === "object" && need !== null && "information_key" in need && need.information_key === "line_route_known")).toBe(false);
    expect(lineRouteResult.planner_result).toMatchObject({ kind: "stop_result", stop: { next_action_type: "present_intermediate_result" } });
    expect(lineRouteResult.rendered_interaction).toBeUndefined();
    expect(activeInteractionFor(lineRouteResult)).toBeNull();
    expect(activeInteractionFor({ ...lineRouteResult, cycle_status: "collection_stopped" })).toBeNull();
    expect(activeInteractionFor({ ...lineRouteResult, cycle_status: "human_review_required" })).toBeNull();
  });
});
