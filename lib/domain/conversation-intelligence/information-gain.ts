import { z } from "zod";
import { ALL_PROPERTY_KEYS, ENTITY_TYPES, type PropertyKey } from "./types";
import { ANSWER_MEANINGS, COLLECTION_STATUSES, DEPENDENCY_AVAILABILITY, dependencySignatureSchema } from "./information-collection";
import { REVISIT_TRIGGERS } from "./question-planner-types";

export const INFORMATION_GAIN_STATUSES=["new_information_expected","context_changed","no_new_information_expected","additional_evidence_needed","customer_path_exhausted","deferred_until_dependency","site_check_candidate","collection_complete_for_channel"] as const;
export const COLLECTION_PATHS=["customer_question","customer_clarification","existing_evidence","future_photo_request","future_document_request","assumption","site_check","human_review","leave_open"] as const;
export const INFORMATION_GAIN_REASON_CODES=["new_information_expected","alternate_question_strategy","dependency_context_changed","same_context_as_previous_attempt","customer_path_exhausted","additional_evidence_required","retry_limit_reached","future_photo_path","site_check_path","no_available_collection_path"] as const;
const uuid=z.string().uuid();
const channels=z.object({customer_question:z.boolean(),customer_clarification:z.boolean(),existing_evidence:z.boolean(),future_photo_request:z.boolean(),future_document_request:z.boolean(),assumption:z.boolean(),site_check:z.boolean(),human_review:z.boolean()}).strict();
export const informationGainAssessmentInputSchema=z.object({project_id:uuid,conversation_id:uuid,information_key:z.enum(ALL_PROPERTY_KEYS),entity_type:z.enum(ENTITY_TYPES),entity_id:uuid,knowledge_state_version:z.number().int().positive(),collection_state_version:z.number().int().nonnegative(),attempts:z.number().int().min(0).max(2),collection_status:z.enum(COLLECTION_STATUSES),last_answer_meaning:z.enum(ANSWER_MEANINGS).optional(),dependency_signature:dependencySignatureSchema,last_dependency_signature:dependencySignatureSchema.optional(),revisit_trigger:z.enum(REVISIT_TRIGGERS).optional(),available_evidence_channels:channels}).strict();
export const informationGainAssessmentSchema=z.object({project_id:uuid,conversation_id:uuid,information_key:z.enum(ALL_PROPERTY_KEYS),entity_type:z.enum(ENTITY_TYPES),entity_id:uuid,knowledge_state_version:z.number().int().positive(),collection_state_version:z.number().int().nonnegative(),gain_status:z.enum(INFORMATION_GAIN_STATUSES),preferred_collection_path:z.enum(COLLECTION_PATHS),revisit_allowed:z.boolean(),reason_codes:z.array(z.enum(INFORMATION_GAIN_REASON_CODES)).min(1).readonly()}).strict();
export type InformationGainAssessmentInput=Readonly<z.infer<typeof informationGainAssessmentInputSchema>>;
export type InformationGainAssessment=Readonly<z.infer<typeof informationGainAssessmentSchema>>;

const AVAILABLE=new Set<typeof DEPENDENCY_AVAILABILITY[number]>(["available","sufficiently_known"]);
export function hasRelevantDependencyDelta(previous:Readonly<Partial<Record<PropertyKey,typeof DEPENDENCY_AVAILABILITY[number]>>>|undefined,current:Readonly<Partial<Record<PropertyKey,typeof DEPENDENCY_AVAILABILITY[number]>>>):boolean{
 if(!previous)return false;
 return (Object.keys(current) as PropertyKey[]).some(key=>!AVAILABLE.has(previous[key]??"missing")&&AVAILABLE.has(current[key]??"missing"));
}
const exhaustedStatuses=new Set<typeof COLLECTION_STATUSES[number]>(["customer_does_not_know","customer_cannot_provide","skipped","deferred","requires_additional_evidence"]);
export function assessInformationGain(input:InformationGainAssessmentInput):InformationGainAssessment{
 const value=informationGainAssessmentInputSchema.parse(input); const base={project_id:value.project_id,conversation_id:value.conversation_id,information_key:value.information_key,entity_type:value.entity_type,entity_id:value.entity_id,knowledge_state_version:value.knowledge_state_version,collection_state_version:value.collection_state_version};
 const result=(gain_status:typeof INFORMATION_GAIN_STATUSES[number],preferred_collection_path:typeof COLLECTION_PATHS[number],revisit_allowed:boolean,reason_codes:readonly typeof INFORMATION_GAIN_REASON_CODES[number][])=>informationGainAssessmentSchema.parse({...base,gain_status,preferred_collection_path,revisit_allowed,reason_codes});
 if(value.attempts>=2)return result("collection_complete_for_channel",value.available_evidence_channels.assumption?"assumption":value.available_evidence_channels.site_check?"site_check":"leave_open",false,["retry_limit_reached",value.available_evidence_channels.site_check?"site_check_path":"no_available_collection_path"]);
 if(value.collection_status==="not_asked"&&value.available_evidence_channels.customer_question)return result("new_information_expected","customer_question",false,["new_information_expected"]);
 if(value.attempts===1&&value.information_key==="room_area_sqm"&&value.available_evidence_channels.customer_clarification)return result("new_information_expected","customer_clarification",false,["alternate_question_strategy"]);
 const dependencyDelta=hasRelevantDependencyDelta(value.last_dependency_signature,value.dependency_signature);
 const requiredRouteContext=value.information_key!=="line_route_known"||(["indoor_unit_position_known","outdoor_unit_position_known"] as const).every(key=>AVAILABLE.has(value.dependency_signature[key]??"missing"));
 const genuineRevisit=value.revisit_trigger==="new_customer_evidence"||value.revisit_trigger==="contradiction_detected"||value.revisit_trigger==="explicit_customer_correction"||(value.revisit_trigger==="new_dependency_information"&&dependencyDelta&&requiredRouteContext);
 if(exhaustedStatuses.has(value.collection_status)&&genuineRevisit&&value.available_evidence_channels.customer_clarification)return result("context_changed","customer_clarification",true,["dependency_context_changed"]);
 if(exhaustedStatuses.has(value.collection_status)||(value.collection_status==="asked"&&["leave_information_open","customer_does_not_know","requires_additional_evidence"].includes(value.last_answer_meaning??""))){
  if(value.available_evidence_channels.existing_evidence)return result("additional_evidence_needed","existing_evidence",false,["additional_evidence_required"]);
  if(value.available_evidence_channels.future_photo_request)return result("additional_evidence_needed","future_photo_request",false,["additional_evidence_required","future_photo_path"]);
  if(value.available_evidence_channels.future_document_request)return result("additional_evidence_needed","future_document_request",false,["additional_evidence_required"]);
  if(value.available_evidence_channels.assumption)return result("customer_path_exhausted","assumption",false,["customer_path_exhausted"]);
  if(value.available_evidence_channels.site_check)return result("site_check_candidate","site_check",false,["customer_path_exhausted","site_check_path"]);
  return result("customer_path_exhausted","leave_open",false,["customer_path_exhausted","same_context_as_previous_attempt","no_available_collection_path"]);
 }
 return result("no_new_information_expected","leave_open",false,["same_context_as_previous_attempt","no_available_collection_path"]);
}
