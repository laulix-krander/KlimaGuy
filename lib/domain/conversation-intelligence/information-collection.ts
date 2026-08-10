import { z } from "zod";
import { ALL_PROPERTY_KEYS, ENTITY_TYPES, type EntityType, type PropertyKey } from "./types";

export const QUESTION_SEMANTIC_MODES = ["technical_property", "customer_knowledge", "customer_preference", "customer_observation", "collection_capability"] as const;
export const ANSWER_MEANINGS = ["technical_true", "technical_false", "customer_knows", "customer_does_not_know", "customer_can_provide", "customer_cannot_provide", "reported_value", "leave_information_open", "defer_collection", "requires_additional_evidence"] as const;
export const COLLECTION_STATUSES = ["not_asked", "asked", "answered", "customer_does_not_know", "customer_cannot_provide", "skipped", "deferred", "requires_additional_evidence", "requires_site_check", "resolved"] as const;
export const EVIDENCE_REQUIREMENTS = ["none", "additional_evidence", "site_check"] as const;
export const REVISIT_STATUSES = ["not_required", "allowed", "deferred", "exhausted"] as const;
export type AnswerMeaning = typeof ANSWER_MEANINGS[number];

const uuid = z.string().uuid(), timestamp = z.string().datetime({ offset: true });
export const informationCollectionItemSchema = z.object({ information_key:z.enum(ALL_PROPERTY_KEYS),entity_type:z.enum(ENTITY_TYPES),entity_id:uuid,collection_status:z.enum(COLLECTION_STATUSES),last_answer_meaning:z.enum(ANSWER_MEANINGS),attempts:z.number().int().min(0).max(2),evidence_requirement:z.enum(EVIDENCE_REQUIREMENTS),revisit_status:z.enum(REVISIT_STATUSES),updated_at:timestamp }).strict();
export const informationCollectionStateSchema = z.object({ project_id:uuid,conversation_id:uuid,version:z.number().int().nonnegative(),items:z.array(informationCollectionItemSchema).readonly(),updated_at:timestamp }).strict().superRefine((v,c)=>{const keys=v.items.map(i=>`${i.information_key}:${i.entity_type}:${i.entity_id}`);if(new Set(keys).size!==keys.length)c.addIssue({code:"custom",message:"duplicate_collection_item"});});
export type InformationCollectionState=z.infer<typeof informationCollectionStateSchema>;

export type InformationCollectionOutcome=Readonly<{information_key:PropertyKey;entity_type:EntityType;entity_id:string;answer_meaning:AnswerMeaning;attempts:number}>;
export type InformationCollectionApplyResult={success:true;state:InformationCollectionState;changed:boolean;result_code:"collection_outcome_applied"|"collection_outcome_unchanged"}|{success:false;code:"invalid_collection_state"};
export function applyInformationCollectionOutcome(stateInput:unknown,outcome:InformationCollectionOutcome,occurredAt:string):InformationCollectionApplyResult{
 const parsed=informationCollectionStateSchema.safeParse(stateInput);if(!parsed.success)return{success:false,code:"invalid_collection_state"};
 const status:typeof COLLECTION_STATUSES[number]=outcome.answer_meaning==="customer_does_not_know"?"customer_does_not_know":outcome.answer_meaning==="customer_cannot_provide"?"customer_cannot_provide":outcome.answer_meaning==="defer_collection"?"deferred":outcome.answer_meaning==="requires_additional_evidence"?"requires_additional_evidence":outcome.answer_meaning==="leave_information_open"?"asked":"answered";
 const evidence_requirement=outcome.answer_meaning==="requires_additional_evidence"?"additional_evidence" as const:"none" as const;
 const revisit_status=["customer_does_not_know","customer_cannot_provide","leave_information_open","requires_additional_evidence"].includes(outcome.answer_meaning)?"allowed" as const:outcome.answer_meaning==="defer_collection"?"deferred" as const:"not_required" as const;
 const item={...outcome,collection_status:status,last_answer_meaning:outcome.answer_meaning,evidence_requirement,revisit_status,updated_at:occurredAt}; delete (item as Partial<typeof item>).answer_meaning;
 const index=parsed.data.items.findIndex(i=>i.information_key===outcome.information_key&&i.entity_type===outcome.entity_type&&i.entity_id===outcome.entity_id);const previous=index<0?undefined:parsed.data.items[index];
 const changed=!previous||previous.collection_status!==status||previous.last_answer_meaning!==outcome.answer_meaning||previous.attempts!==outcome.attempts;
 if(!changed)return{success:true,state:parsed.data,changed:false,result_code:"collection_outcome_unchanged"};
 const items=index<0?[...parsed.data.items,item]:parsed.data.items.map((v,i)=>i===index?item:v);return{success:true,state:informationCollectionStateSchema.parse({...parsed.data,version:parsed.data.version+1,items,updated_at:occurredAt}),changed:true,result_code:"collection_outcome_applied"};
}
