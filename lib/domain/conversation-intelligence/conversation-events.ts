import { conversationCycleEventSchema } from "./conversation-cycle-schemas";
import type { ConversationEvent, DeriveEventsInput } from "./conversation-cycle-types";

export function deriveConversationEvents(input:DeriveEventsInput):Readonly<{success:true;events:readonly ConversationEvent[]}|{success:false;code:"event_derivation_failed"}>{
 if(input.apply_result.code==="transition_already_applied")return{success:true,events:[]};
 const p=input.proposal, descriptors:Array<{event_type:ConversationEvent["event_type"];actor_class:"customer"|"system";payload:Record<string,string|number>}>=[];
 descriptors.push({event_type:"customer_answer_interpreted",actor_class:"customer",payload:{answer_id:p.answer_id,interpretation_id:p.interpretation_id,transition_id:p.transition_id}});
 for(const claim of p.claim_proposals)descriptors.push({event_type:"knowledge_claim_recorded",actor_class:"system",payload:{claim_id:claim.claim_id,information_key:p.information_key}});
 for(let i=0;i<p.superseded_claim_ids.length;i++)descriptors.push({event_type:"knowledge_claim_superseded",actor_class:"system",payload:{claim_id:p.claim_proposals[i]?.claim_id??p.claim_proposals[0]?.claim_id,superseded_claim_id:p.superseded_claim_ids[i]}});
 const semantic:Partial<Record<typeof p.transition_type,ConversationEvent["event_type"]>>={unknown_recorded:"answer_unknown_recorded",skip_recorded:"answer_skipped",assumption_confirmed:"assumption_confirmed",assumption_rejected:"assumption_rejected",assumption_deferred:"assumption_deferred",human_review_required:"human_review_requested"};
 const eventType=semantic[p.transition_type];if(eventType)descriptors.push({event_type:eventType,actor_class:eventType==="human_review_requested"?"system":"customer",payload:eventType==="human_review_requested"?{interpretation_id:p.interpretation_id,result_code:"human_review_required"}:{answer_id:p.answer_id,information_key:p.information_key}});
 descriptors.push({event_type:"conversation_cycle_completed",actor_class:"system",payload:{transition_id:p.transition_id,result_code:input.result_code}});
 if(input.event_ids.length<descriptors.length)return{success:false,code:"event_derivation_failed"};
 const events=descriptors.map((d,index)=>({...d,event_id:input.event_ids[index],conversation_id:p.conversation_id,project_id:p.project_id,sequence:input.sequence_start+index,occurred_at:input.occurred_at,state_version_before:input.apply_result.previous_state_version,state_version_after:input.apply_result.new_state_version,correlation_id:input.correlation_id}));
 if(events.some((e,i)=>!conversationCycleEventSchema.safeParse(e).success||(i>0&&e.sequence<=events[i-1].sequence)))return{success:false,code:"event_derivation_failed"};return{success:true,events:events as readonly ConversationEvent[]};
}
