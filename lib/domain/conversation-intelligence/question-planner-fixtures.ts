import { buildIntermediateAssessment } from "./intermediate-assessment";
import { deriveMissingInformation } from "./readiness";
import { SYNTHETIC_IDS, SYNTHETIC_SINGLE_ROOM_STATES } from "./fixtures";
import type { PlannerContext, RetryState } from "./question-planner-schemas";
import type { KnowledgeState } from "./schemas";

const AT = "2026-08-06T14:00:00.000Z";
const ASSESSMENT_ID = "60000000-0000-4000-8000-000000000001";
export function createSyntheticPlannerContext(state: KnowledgeState = SYNTHETIC_SINGLE_ROOM_STATES.A, overrides: Partial<PlannerContext> = {}): PlannerContext {
  const assessment = buildIntermediateAssessment(state, { assessment_id: ASSESSMENT_ID, project_id: state.project_id, conversation_id: state.conversation_id, based_on_state_version: state.state_version, created_at: AT, created_by_actor_class: "system" });
  if (!assessment.success) throw new Error("synthetic_assessment_failed");
  return { project_id: state.project_id, conversation_id: state.conversation_id, state_version: state.state_version, knowledge_state: state, intermediate_assessment: assessment.data, missing_information: deriveMissingInformation(state), target_readiness_level: "level_3_preliminary_installation", retry_state: [], customer_effort_state: { consecutive_technical_questions: 0, unanswered_questions: 0, repeated_questions: 0 }, created_at: AT, ...overrides };
}
export function syntheticRetry(information_key: RetryState["information_key"], entity_type: RetryState["entity_type"], entity_id: string, attempts: 0 | 1 | 2, last_outcome: RetryState["last_outcome"]): RetryState {
  return { information_key, entity_type, entity_id, attempts, last_outcome, ...(attempts ? { last_attempt_at: AT } : {}) };
}
export const SYNTHETIC_PLANNER_CONTEXTS = {
  roomAreaMissing: createSyntheticPlannerContext(),
  targetReached: createSyntheticPlannerContext(SYNTHETIC_SINGLE_ROOM_STATES.C),
  effortLimit: createSyntheticPlannerContext(undefined, { customer_effort_state: { consecutive_technical_questions: 4, unanswered_questions: 1, repeated_questions: 1 } }),
  safetyTakeover: createSyntheticPlannerContext(undefined, { human_takeover_reason: "safety_conflict" }),
} as const;
export const SYNTHETIC_PLANNER_IDS = { decision: "60000000-0000-4000-8000-000000000002", created_at: AT, ...SYNTHETIC_IDS } as const;
