import { describe, expect, it } from "vitest";
import { continueConversationAfterIntermediateResult, createSimulatorStart, executeSimulatorAnswer, executeSimulatorContinuation } from "@/lib/domain/conversation-intelligence";

function intermediateCycle() {
  let context = createSimulatorStart("empty_synthetic_project");
  for (let cycle = 1; cycle <= 5; cycle += 1) {
    const interaction = context.interpretation_inputs.rendered_interaction;
    const answer = interaction.answer_contract?.answer_type === "boolean"
      ? { kind: "option" as const, option_key: "yes" }
      : { kind: "text" as const, value: interaction.template_key === "ask_room_area_approximate" ? "ca. 25 m²" : interaction.template_key === "ask_building_type" ? "Einfamilienhaus" : "Wohnzimmer" };
    const execution = executeSimulatorAnswer(context, answer, cycle);
    if (execution.result?.success && execution.result.cycle_status === "intermediate_result_ready") return { context, result: execution.result };
    context = execution.next!;
  }
  throw new Error("intermediate fixture was not reached");
}

function continuationInput() {
  const { result } = intermediateCycle();
  return {
    project_id: result.knowledge_state.project_id,
    conversation_id: result.knowledge_state.conversation_id,
    knowledge_state: result.knowledge_state,
    information_collection_state: result.information_collection_state,
    retry_state: { ...result.retry_state, items: [{ information_key: "room_area_sqm" as const, entity_type: "room" as const, entity_id: result.knowledge_state.claims.find((claim) => claim.entity_type === "room")!.entity_id, attempts: 1, last_outcome: "unknown" as const, last_attempt_at: "2026-08-07T10:04:00.000Z" }] },
    customer_effort_state: { ...result.customer_effort_state, unanswered_questions: 3, repeated_questions: 2 },
    evidence_request_state: result.evidence_request_state,
    evidence_availability: result.evidence_availability,
    previous_planner_result: result.planner_result,
    expected_state_version: result.current_state_version,
    assessment_id: "93000000-0000-4000-8000-000000000001",
    planner_decision_id: "93000000-0000-4000-8000-000000000002",
    planner_candidate_ids: ["93000000-0000-4000-8000-000000000003"],
    occurred_at: "2026-08-07T12:00:00.000Z",
    template_version: 1,
    locale: "de" as const,
  };
}

describe("controlled post-intermediate continuation", () => {
  it("verarbeitet auch ein zweites Continue deterministisch ohne stale Interaction",()=>{
    let context=createSimulatorStart("empty_synthetic_project");let continuations=0;
    for(let cycle=1;cycle<=20;cycle+=1){const interaction=context.interpretation_inputs.rendered_interaction;const raw=interaction.answer_contract?.answer_type==="boolean"?{kind:"option" as const,option_key:"yes"}:{kind:"text" as const,value:interaction.template_key==="ask_room_area_approximate"?"ca. 25 m²":interaction.template_key==="ask_building_type"?"Einfamilienhaus":"Wohnzimmer"};const answered=executeSimulatorAnswer(context,raw,cycle);if(answered.next){context=answered.next;continue;}if(answered.result?.success&&answered.result.cycle_status==="intermediate_result_ready"){continuations+=1;const continued=executeSimulatorContinuation(context,answered.result,cycle+20);expect(continued.result.success).toBe(true);if(continuations===2){expect(continued.result.success&&continued.result.planner_result.kind).toMatch(/selected_action|stop_result/u);return;}if(continued.next){context=continued.next;continue;}}break;}throw new Error("second_continuation_not_reached");
  });
  it("resets only the technical-question break and selects a new action without state mutation", () => {
    const input = continuationInput();
    const knowledge = structuredClone(input.knowledge_state);
    const retry = structuredClone(input.retry_state);
    const result = continueConversationAfterIntermediateResult(input);
    expect(result).toMatchObject({ success: true, status: "next_action_selected", customer_effort_state: { consecutive_technical_questions: 0, unanswered_questions: 3, repeated_questions: 2 } });
    if (!result.success) return;
    expect(result.knowledge_state).toEqual(knowledge);
    expect(result.knowledge_state.claims).toEqual(knowledge.claims);
    expect(result.retry_state).toEqual(retry);
    expect(result.assessment.based_on_state_version).toBe(knowledge.state_version);
    expect(result.planner_result.kind === "selected_action" && result.planner_result.action.based_on_state_version).toBe(knowledge.state_version);
    expect(result.rendered_interaction?.template_key).not.toBe("ask_line_route_known");
  });

  it("is a deterministic replay with injected identifiers and timestamps", () => {
    const input = continuationInput();
    expect(continueConversationAfterIntermediateResult(input)).toEqual(continueConversationAfterIntermediateResult(structuredClone(input)));
  });

  it("rejects human review, final-target and non-intermediate previous results", () => {
    const input = continuationInput();
    if (input.previous_planner_result.kind !== "stop_result") throw new Error("invalid fixture");
    expect(continueConversationAfterIntermediateResult({ ...input, previous_planner_result: { kind: "stop_result", stop: { ...input.previous_planner_result.stop, stop_reason: "requires_human_review", next_action_type: "request_human_review", reason_codes: ["customer_requests_human"] } } })).toMatchObject({ success: false, code: "previous_result_not_intermediate" });
    expect(continueConversationAfterIntermediateResult({ ...input, previous_planner_result: { kind: "stop_result", stop: { ...input.previous_planner_result.stop, stop_reason: "target_readiness_reached", reason_codes: ["target_reached"] } } })).toMatchObject({ success: false, code: "continuation_not_allowed" });
    expect(continueConversationAfterIntermediateResult({ ...input, previous_planner_result: { kind: "selected_action", action: intermediateCycle().context.interpretation_inputs.selected_action } })).toMatchObject({ success: false, code: "previous_result_not_intermediate" });
  });

  it("rejects stale continuation state without silently replanning", () => {
    const input = continuationInput();
    expect(continueConversationAfterIntermediateResult({ ...input, expected_state_version: input.expected_state_version + 1 })).toMatchObject({ success: false, code: "state_version_mismatch", requires_replanning: true });
  });
});
