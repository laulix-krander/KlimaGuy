import type { SelectedNextAction } from "./question-planner-schemas";
import { conversationRetryStateSchema } from "./conversation-cycle-schemas";
import type { ConversationRetryState } from "./conversation-cycle-types";

export type RetryApplyResult={success:true;state:ConversationRetryState}|{success:false;code:"retry_state_application_failed"};
export function applyRetryOutcome(stateInput:unknown,input:Readonly<{information_key:SelectedNextAction["information_key"];entity_type:SelectedNextAction["entity_type"];entity_id:string;retry_outcome:"answered"|"unknown"|"skipped"|"superseded";occurred_at:string}>):RetryApplyResult{
 const parsed=conversationRetryStateSchema.safeParse(stateInput); if(!parsed.success)return{success:false,code:"retry_state_application_failed"};
 const state=parsed.data,index=state.items.findIndex(i=>i.information_key===input.information_key&&i.entity_type===input.entity_type&&i.entity_id===input.entity_id); const old=index<0?undefined:state.items[index];
 const attempts=input.retry_outcome==="superseded"?(old?.attempts??0):input.retry_outcome==="answered"?(old?.attempts??0):Math.min(2,(old?.attempts??0)+1);
 const item={information_key:input.information_key,entity_type:input.entity_type,entity_id:input.entity_id,attempts,last_outcome:input.retry_outcome==="superseded"?"superseded":input.retry_outcome,last_attempt_at:input.occurred_at};
 const items=index<0?[...state.items,item]:state.items.map((v,i)=>i===index?item:v); const next=conversationRetryStateSchema.safeParse({...state,items,updated_at:input.occurred_at});return next.success?{success:true,state:next.data}:{success:false,code:"retry_state_application_failed"};
}
const TECHNICAL=new Set(["ask_text","ask_yes_no","ask_approximate_number"]);
export function applyCustomerEffortOutcome(state:Readonly<{consecutive_technical_questions:number;unanswered_questions:number;repeated_questions:number;last_break_at?:string}>, action:SelectedNextAction, outcome:"answered"|"unknown"|"skipped", wasRetry:boolean, occurredAt:string){
 if(!TECHNICAL.has(action.action_type))return{...state,consecutive_technical_questions:0,last_break_at:occurredAt};
 return{...state,consecutive_technical_questions:Math.min(4,state.consecutive_technical_questions+1),unanswered_questions:state.unanswered_questions+(outcome==="answered"?0:1),repeated_questions:state.repeated_questions+(wasRetry?1:0)};
}
