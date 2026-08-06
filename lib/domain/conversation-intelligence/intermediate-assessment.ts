import { intermediateAssessmentSchema, knowledgeStateSchema, type IntermediateAssessment } from "./schemas";
import { findContradictions, getEffectiveClaims } from "./knowledge-state";
import { deriveMissingInformation, deriveReadiness } from "./readiness";
import type { ActorClass, DomainResult } from "./types";

export type AssessmentInput = { assessment_id: string; project_id: string; conversation_id: string; based_on_state_version: number; created_at: string; created_by_actor_class: Extract<ActorClass, "system" | "admin" | "reviewer"> };

export function buildIntermediateAssessment(stateInput: unknown, input: AssessmentInput): DomainResult<IntermediateAssessment> {
  const state = knowledgeStateSchema.safeParse(stateInput);
  if (!state.success) return { success: false, code: "invalid_state_version" };
  if (input.project_id !== state.data.project_id) return { success: false, code: "project_mismatch" };
  if (input.conversation_id !== state.data.conversation_id) return { success: false, code: "conversation_mismatch" };
  if (input.based_on_state_version !== state.data.state_version) return { success: false, code: "assessment_version_mismatch" };
  const readiness = deriveReadiness(state.data);
  const claims = getEffectiveClaims(state.data);
  const missing = deriveMissingInformation(state.data);
  const siteCheck = claims.filter((claim) => claim.epistemic_status === "requires_site_check").map((claim) => claim.property_key);
  const rank = Number(readiness.readiness_level.slice(6, 7));
  const allowed = ["collect_more_information" as const];
  if (rank >= 1) allowed.push("rough_need_available" as never);
  if (rank >= 2) allowed.push("preliminary_system_scope_available" as never);
  if (rank >= 3) allowed.push("preliminary_installation_scope_available" as never);
  if (rank >= 4) allowed.push("offer_draft_structure_available" as never);
  if (siteCheck.length) allowed.push("site_visit_recommended" as never);
  const parsed = intermediateAssessmentSchema.safeParse({
    ...input, readiness_level: readiness.readiness_level, readiness_dimensions: readiness.readiness_dimensions,
    known_facts: claims.filter((claim) => ["confirmed", "observed"].includes(claim.epistemic_status)).map((claim) => claim.claim_id),
    reported_information: claims.filter((claim) => claim.epistemic_status === "reported").map((claim) => claim.claim_id),
    assumptions: claims.filter((claim) => claim.epistemic_status === "assumed").map((claim) => claim.claim_id),
    unknowns: missing.map((item) => item.information_key), contradictions: findContradictions(state.data), site_check_items: siteCheck,
    allowed_outputs: allowed, prohibited_outputs: ["fixed_price", "final_offer", "final_technical_approval", "confirmed_installation_position", "confirmed_electrical_scope", "human_approval"],
  });
  return parsed.success ? { success: true, data: parsed.data } : { success: false, code: "invalid_claim" };
}
