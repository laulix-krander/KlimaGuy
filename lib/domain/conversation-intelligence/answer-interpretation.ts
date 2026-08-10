import { interpretationContextSchema, interpretationResultSchema } from "./answer-interpretation-schemas";
import { ASSUMPTION_VALUE_REGISTRY, getAnswerInterpretationRule } from "./answer-interpretation-registry";
import { getEffectiveClaims } from "./knowledge-state";
import type { EvidenceProposal, ExplanationCode, InterpretationContext, InterpretationErrorCode, InterpretationResult, KnowledgeClaimProposal, StateTransitionProposal, SupersessionReasonCode } from "./answer-interpretation-types";

export const createInterpretationIdempotencyKey = (conversationId: string, decisionId: string, answerId: string) => `${conversationId}:${decisionId}:${answerId}`;
const failure = (code: InterpretationErrorCode, flags: Partial<Pick<Extract<InterpretationResult, { success: false }>, "requires_replanning" | "requires_human_review">> = {}): InterpretationResult => ({ success: false, code, retryable: false, requires_replanning: flags.requires_replanning ?? false, requires_human_review: flags.requires_human_review ?? false, causes_state_change: false });

function bindingFailure(context: InterpretationContext): InterpretationResult | undefined {
  const { knowledge_state: state, selected_action: action, rendered_interaction: interaction, normalized_answer: answer } = context;
  if (state.project_id !== context.project_id || action.project_id !== context.project_id || interaction.project_id !== context.project_id || answer.project_id !== context.project_id) return failure("project_mismatch");
  if (state.conversation_id !== context.conversation_id || action.conversation_id !== context.conversation_id || interaction.conversation_id !== context.conversation_id || answer.conversation_id !== context.conversation_id) return failure("conversation_mismatch");
  if (state.state_version !== context.current_state_version || action.based_on_state_version !== context.current_state_version) return failure("state_version_mismatch", { requires_replanning: true });
  if (interaction.decision_id !== action.decision_id || answer.decision_id !== action.decision_id) return failure("decision_mismatch");
  if (interaction.template_key !== action.template_key || interaction.template_version !== action.template_version || answer.template_key !== interaction.template_key || answer.template_version !== interaction.template_version) return failure("template_binding_mismatch");
  if (context.idempotency_key !== createInterpretationIdempotencyKey(context.conversation_id, action.decision_id, answer.answer_id)) return failure("answer_binding_mismatch");
  if (context.application_status === "duplicate_answer") return failure("duplicate_answer");
  if (context.application_status === "mapping_already_applied") return failure("mapping_already_applied");
}

export function interpretNormalizedAnswer(input: unknown): InterpretationResult {
  const parsed = interpretationContextSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_interpretation_context");
  const context = parsed.data as InterpretationContext;
  const badBinding = bindingFailure(context); if (badBinding) return badBinding;
  const { selected_action: action, normalized_answer: answer } = context;
  const rule = getAnswerInterpretationRule(action.information_key); if (!rule) return failure("mapping_rule_not_found");
  if (rule.property_key !== action.information_key) return failure("information_property_mismatch");
  if (rule.entity_type !== action.entity_type) return failure("entity_type_mismatch");
  if (action.entity_id !== (context.selected_action.entity_id)) return failure("entity_id_mismatch");

  const base = { transition_id: context.proposal_ids.transition_id, interpretation_id: context.interpretation_id, idempotency_key: context.idempotency_key, project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.current_state_version, answer_id: answer.answer_id, information_key: rule.information_key, created_at: context.interpreted_at } as const;
  const proposal = (transition_type: StateTransitionProposal["transition_type"], changes: boolean, evidence_proposals: readonly EvidenceProposal[], claim_proposals: readonly KnowledgeClaimProposal[], superseded_claim_ids: readonly string[], retry_outcome: StateTransitionProposal["retry_outcome"], explanation_codes: readonly ExplanationCode[], collection_outcome?: StateTransitionProposal["collection_outcome"]): InterpretationResult => interpretationResultSchema.parse({ success: true, proposal: { ...base, transition_type, proposed_state_version: context.current_state_version + (changes ? 1 : 0), evidence_proposals, claim_proposals, superseded_claim_ids, retry_outcome, explanation_codes, semantic_result_type: changes ? (collection_outcome ? "technical_and_collection_update" : "technical_transition") : collection_outcome ? "collection_update_only" : "no_change", ...(collection_outcome ? { collection_outcome } : {}) }, ...(transition_type === "duplicate_no_change" ? { code: "idempotent_success" } : {}) }) as InterpretationResult;
  const meaningFor=(outcome:"yes"|"no"|"unknown"|"skip")=>rule.meanings?.[outcome];
  const collectionOnly=(meaning:NonNullable<ReturnType<typeof meaningFor>>,outcome:"answered"|"unknown"|"skipped",transition:StateTransitionProposal["transition_type"])=>proposal(transition,false,[],[],[],outcome,["mapping_rule_applied",...(outcome==="skipped"?["skip_without_property_claim" as const]:["unknown_value_recorded" as const])],{information_key:rule.information_key,entity_type:rule.entity_type,entity_id:action.entity_id,answer_meaning:meaning,attempts:outcome==="answered"?0:1});
  if (answer.outcome === "skipped") return rule.meanings ? collectionOnly(meaningFor("skip")!,"skipped","skip_recorded") : proposal("skip_recorded", false, [], [], [], "skipped", ["mapping_rule_applied", "skip_without_property_claim"]);
  if (rule.status === "deferred") return failure("unsupported_text_mapping", { requires_replanning: true });
  if (rule.meanings && answer.outcome === "unknown") return collectionOnly(meaningFor("unknown")!,"unknown","unknown_recorded");
  if (rule.meanings && answer.outcome === "answered" && answer.value.kind === "boolean") { const meaning=meaningFor(answer.value.value ? "yes" : "no")!; if (!["technical_true","technical_false"].includes(meaning)) return collectionOnly(meaning,"answered","unknown_recorded"); }
  if (answer.outcome === "assumption_rejected") return action.action_type === "offer_assumption" ? proposal("assumption_rejected", false, [], [], [], "answered", ["mapping_rule_applied"]) : failure("unsupported_answer_outcome");
  if (answer.outcome === "deferred") return action.action_type === "offer_assumption" ? proposal("assumption_deferred", false, [], [], [], "skipped", ["mapping_rule_applied"]) : failure("unsupported_answer_outcome");
  if (answer.outcome === "invalid") return failure("unsupported_answer_outcome");
  const customerEvidence: EvidenceProposal = { evidence_id: context.proposal_ids.customer_evidence_id, source_type: "customer_message", source_id: context.source_message_id, actor_class: "customer", observed_at: context.interpreted_at, evidence_status: "active" };
  let value: string | number | boolean | null; let value_type: "string" | "number" | "boolean" | "unknown"; let epistemic_status: "reported" | "unknown" | "assumed"; let approximation: "exact" | "approximate" | undefined; let evidence: readonly EvidenceProposal[] = [customerEvidence];
  const explanations: ExplanationCode[] = ["mapping_rule_applied"]; let transition: StateTransitionProposal["transition_type"] = "claim_created";
  if (answer.outcome === "unknown") { value = null; value_type = "unknown"; epistemic_status = "unknown"; transition = "unknown_recorded"; explanations.push("unknown_value_recorded"); }
  else if (answer.outcome === "assumption_confirmed") {
    if (action.action_type !== "offer_assumption" || !action.assumption_key) return failure("assumption_key_missing");
    const assumption = ASSUMPTION_VALUE_REGISTRY[action.assumption_key as keyof typeof ASSUMPTION_VALUE_REGISTRY];
    if (!assumption || assumption.information_key !== rule.information_key || !rule.supports_assumption) return failure("assumption_not_allowed");
    if (!context.proposal_ids.system_evidence_id) return failure("evidence_binding_invalid");
    const systemEvidence: EvidenceProposal = { evidence_id: context.proposal_ids.system_evidence_id, source_type: "system_rule", source_id: context.proposal_ids.system_evidence_id, actor_class: "system", observed_at: context.interpreted_at, evidence_status: "active" };
    value = assumption.value; value_type = assumption.value_type; approximation = assumption.approximation; epistemic_status = "assumed"; evidence = [systemEvidence, customerEvidence]; transition = "assumption_confirmed"; explanations.push("assumption_value_from_server_rule", "customer_confirmation_evidence_added");
  } else {
    if (answer.outcome !== "answered") return failure("unsupported_answer_outcome");
    const answeredValue = answer.value;
    if (answeredValue.kind === "number_range") return failure("numeric_range_not_supported", { requires_replanning: true });
    if (answeredValue.kind === "text") { const canonical=rule.canonical_values?.[answeredValue.value.trim().toLocaleLowerCase("de-DE")]; if (!canonical) return failure("unsupported_text_mapping", { requires_replanning: true }); value=canonical; value_type="string"; epistemic_status="reported"; explanations.push("customer_answer_reported"); } else {
    if (answeredValue.kind !== rule.supported_normalized_kind) return failure("answer_value_type_mismatch");
    value = answeredValue.value; value_type = answeredValue.kind; epistemic_status = "reported"; explanations.push("customer_answer_reported");
    if (answeredValue.kind === "number") { approximation = answeredValue.approximation; if (approximation === "approximate") explanations.push("approximate_value_preserved"); } }
  }
  const effective = getEffectiveClaims(context.knowledge_state).filter((claim) => claim.entity_type === rule.entity_type && claim.entity_id === action.entity_id && claim.property_key === rule.property_key);
  const same = effective.find((claim) => claim.value_type === value_type && Object.is(claim.value, value) && claim.epistemic_status === epistemic_status);
  if (same) return proposal("duplicate_no_change", false, [], [], [], answer.outcome === "unknown" ? "unknown" : "answered", ["mapping_rule_applied", "duplicate_value_detected"]);
  const differing = [...effective].sort((a, b) => b.state_version - a.state_version)[0]; let supersedes: string | undefined; const reasons: SupersessionReasonCode[] = [];
  if (differing && value !== null && epistemic_status === "reported") {
    const protectedClaim = differing.evidence.some((item) => item.actor_class === "reviewer" || item.evidence_status === "manually_corrected" || item.source_type === "reviewer_correction");
    if (protectedClaim) return failure("reviewer_correction_protected", { requires_human_review: true });
    if (differing.epistemic_status === "unknown") { supersedes = differing.claim_id; reasons.push("unknown_replaced_by_reported_value"); explanations.push("existing_unknown_superseded"); }
    else if (differing.epistemic_status === "assumed") { supersedes = differing.claim_id; reasons.push("assumption_replaced_by_reported_value"); explanations.push("existing_assumption_superseded"); }
    else if (context.correction_context === "explicit_customer_correction") { supersedes = differing.claim_id; reasons.push("explicit_customer_correction"); explanations.push("explicit_correction_applied"); }
    else { reasons.push("parallel_contradictory_claim"); explanations.push("contradiction_preserved"); transition = "contradiction_recorded"; }
  }
  if (supersedes) transition = "claim_supersession_proposed";
  const nextVersion = context.current_state_version + 1;
  const claim: KnowledgeClaimProposal = { claim_id: context.proposal_ids.claim_id, project_id: context.project_id, entity_type: rule.entity_type, entity_id: action.entity_id, property_key: rule.property_key, value, value_type, epistemic_status, evidence, based_on_state_version: context.current_state_version, proposed_state_version: nextVersion, ...(supersedes ? { supersedes_claim_id: supersedes } : {}), ...(approximation ? { approximation } : {}), proposal_reason_codes: reasons };
  return proposal(transition, true, evidence, [claim], supersedes ? [supersedes] : [], answer.outcome === "unknown" ? "unknown" : "answered", explanations);
}
