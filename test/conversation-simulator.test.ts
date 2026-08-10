import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { activeInteractionFor, ConversationSimulator } from "@/app/(app)/admin/intelligence/simulator/simulator-view";
import { canUseConversationSimulator } from "@/lib/domain/permissions";
import { createSimulatorStart, executeSimulatorAnswer, executeSimulatorContinuation, SIMULATOR_SCENARIOS } from "@/lib/domain/conversation-intelligence";

const answerFor=(template:string,booleanAnswer:boolean)=>booleanAnswer?{kind:"option" as const,option_key:"yes"}:{kind:"text" as const,value:template==="ask_room_area_approximate"?"ca. 25 m²":template==="ask_building_type"?"Einfamilienhaus":"Wohnzimmer"};
function reachLineRoute(){let context=createSimulatorStart("empty_synthetic_project");for(let cycle=1;cycle<=12;cycle+=1){const interaction=context.interpretation_inputs.rendered_interaction;const execution=executeSimulatorAnswer(context,answerFor(interaction.template_key,interaction.answer_contract?.answer_type==="boolean"),cycle);if(interaction.template_key==="ask_line_route_known")return execution;if(execution.next){context=execution.next;continue;}if(execution.result?.success&&execution.result.cycle_status==="intermediate_result_ready"){const continued=executeSimulatorContinuation(context,execution.result,cycle+20);if(continued.next){context=continued.next;continue;}}throw new Error("controlled_progression_stopped_early");}throw new Error("line_route_fixture_not_reached");}

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

  it("transportiert Kundenwissen zum Leitungsweg getrennt vom technischen Zustand", () => {
    const execution=reachLineRoute();expect(execution.result?.success&&execution.result.information_collection_state.items.some(item=>item.information_key==="line_route_known"&&item.last_answer_meaning==="customer_knows")).toBe(true);expect(execution.result?.success&&execution.result.knowledge_state.claims.some(claim=>claim.property_key==="line_route_known")).toBe(false);
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
    const lineRouteResult=reachLineRoute().result;
    expect(lineRouteResult?.success).toBe(true);
    if (!lineRouteResult?.success) return;
    expect(lineRouteResult.knowledge_state.claims.some((claim) => claim.property_key === "line_route_known")).toBe(false);
    expect(lineRouteResult.information_collection_state.items.some((item) => item.information_key === "line_route_known" && item.last_answer_meaning === "customer_knows")).toBe(true);
    expect(lineRouteResult.missing_information.some((need) => typeof need === "object" && need !== null && "information_key" in need && need.information_key === "line_route_known")).toBe(true);
    expect(lineRouteResult.planner_result.kind).toMatch(/selected_action|stop_result/u);
  });
});
