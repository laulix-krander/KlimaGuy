import { createSyntheticInterpretationContext } from "./answer-interpretation-fixtures";
import type { ConversationCycleContext } from "./conversation-cycle-types";

const IDS=Object.freeze({cycle:"91000000-0000-4000-8000-000000000001",correlation:"91000000-0000-4000-8000-000000000002",apply:"91000000-0000-4000-8000-000000000003",assessment:"91000000-0000-4000-8000-000000000004",decision:"91000000-0000-4000-8000-000000000005"});
const eventIds=Object.freeze(Array.from({length:10},(_,i)=>`91000000-0000-4000-8000-${String(100+i).padStart(12,"0")}`));
export function createSyntheticConversationCycleContext(outcome:Parameters<typeof createSyntheticInterpretationContext>[1]="exact",overrides:Partial<ConversationCycleContext>={}):ConversationCycleContext{
 const source=createSyntheticInterpretationContext(outcome?.startsWith("assumption")||outcome==="deferred"?"assumption":"roomArea",outcome);
 const {knowledge_state,normalized_answer,current_state_version,project_id,conversation_id,...interpretation_inputs}=source;
 return{cycle_id:IDS.cycle,correlation_id:IDS.correlation,project_id,conversation_id,knowledge_state,retry_state:{project_id,conversation_id,items:[],updated_at:source.interpreted_at},customer_effort_state:{consecutive_technical_questions:0,unanswered_questions:0,repeated_questions:0},normalized_answer,interpretation_inputs,expected_state_version:current_state_version,next_state_ids:{apply_id:IDS.apply},event_ids:eventIds,event_sequence_start:100,occurred_at:source.interpreted_at,assessment_id:IDS.assessment,planner_decision_id:IDS.decision,planner_candidate_ids:[],template_version:1,locale:"de",execution_status:"not_processed",...overrides};
}
export const SYNTHETIC_CONVERSATION_CYCLE_FIXTURES=Object.freeze({A:createSyntheticConversationCycleContext("exact"),B:createSyntheticConversationCycleContext("approximate"),C:createSyntheticConversationCycleContext("unknown"),E:createSyntheticConversationCycleContext("skipped"),F:createSyntheticConversationCycleContext("assumption_confirmed"),G:createSyntheticConversationCycleContext("assumption_rejected")});
