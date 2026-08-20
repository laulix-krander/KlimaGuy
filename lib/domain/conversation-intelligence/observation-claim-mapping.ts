import { z } from "zod";
import { evidenceObservationSchema, evidenceQualitySchema, type EvidenceObservation, type EvidenceQuality } from "./evidence-observation";
import { evidenceTargetKeySchema } from "./evidence-request";
import { evidenceProposalSchema, knowledgeClaimProposalSchema } from "./answer-interpretation-schemas";
import { knowledgeStateSchema } from "./schemas";
import { ALL_PROPERTY_KEYS, ENTITY_TYPES, EPISTEMIC_STATUSES, PROPERTY_KEYS, type EntityType } from "./types";

export const OBSERVATION_CLAIM_MAPPING_VERSION = 1 as const;
export const OBSERVATION_REVIEW_CLASSES = ["auto_observable", "auto_proposable", "human_review_required", "site_check_only"] as const;
export const OBSERVATION_MAPPING_REASON_CODES = [
  "descriptive_observation_only", "no_lossless_knowledge_property", "evidence_quality_insufficient",
  "evidence_ambiguous", "wrong_target", "invalid_observation_context", "mapping_not_supported",
  "observation_conflict", "customer_claim_conflict", "reviewer_protected_claim", "actor_not_permitted",
  "technical_inference_requires_review", "electrical_suitability_site_check_only", "core_drilling_safety_site_check_only",
  "hidden_services_site_check_only", "structural_safety_site_check_only", "legal_noise_assessment_site_check_only",
  "final_mounting_approval_site_check_only", "placement_not_determined", "line_route_feasibility_not_observed",
  "safe_access_not_observed", "explicit_observation_set_required", "claim_proposal_created",
] as const;
export const OBSERVATION_SUFFICIENCY_KINDS = ["sufficient_for_proposal", "insufficient", "observation_only", "human_review_required", "site_check_required"] as const;
export const OBSERVATION_MAPPING_RESULT_KINDS = ["claim_proposal", "observation_only", "human_review_required", "site_check_required", "insufficient_evidence", "unsupported_mapping", "conflicting_observations", "invalid_context"] as const;

const uuid=z.string().uuid(), timestamp=z.string().datetime({offset:true});
export const observationReviewClassSchema=z.enum(OBSERVATION_REVIEW_CLASSES);
export const observationMappingReasonCodeSchema=z.enum(OBSERVATION_MAPPING_REASON_CODES);
export const observationSufficiencySchema=z.object({kind:z.enum(OBSERVATION_SUFFICIENCY_KINDS),reason_codes:z.array(observationMappingReasonCodeSchema).min(1).readonly()}).strict();
export const observationClaimMappingRuleSchema=z.object({
  rule_key:z.string().min(1),version:z.literal(OBSERVATION_CLAIM_MAPPING_VERSION),target_key:evidenceTargetKeySchema,
  observation_type:z.enum(["room_overview_visible","wall_area_visible","window_visible","door_visible","indoor_area_visible","outdoor_area_visible","possible_indoor_mounting_area_visible","possible_outdoor_mounting_area_visible","line_route_context_visible","wall_penetration_context_visible","electrical_connection_visible","accessibility_context_visible","measurement_reference_visible","image_insufficient","image_obstructed","image_wrong_area"]),
  observation_value:z.enum(["visible","not_visible"]).nullable(),entity_type:z.enum(ENTITY_TYPES),property_key:z.enum(ALL_PROPERTY_KEYS).nullable(),review_class:observationReviewClassSchema,
  permitted_property:z.enum(ALL_PROPERTY_KEYS).nullable(),permitted_epistemic_status:z.enum(EPISTEMIC_STATUSES).nullable(),minimum_evidence_quality:evidenceQualitySchema,
  allowed_source_actors:z.array(z.enum(["admin","reviewer","ai"])).min(1).readonly(),reason_codes:z.array(observationMappingReasonCodeSchema).min(1).readonly(),requires_observation_set:z.array(z.string().min(1)).min(1).readonly().optional(),site_check_boundary:z.boolean(),
}).strict().superRefine((rule,ctx)=>{if(rule.property_key!==rule.permitted_property)ctx.addIssue({code:"custom",message:"permitted_property_mismatch"});if(rule.property_key&&!PROPERTY_KEYS[rule.entity_type].includes(rule.property_key as never))ctx.addIssue({code:"custom",message:"property_entity_mismatch"});if(rule.review_class==="auto_proposable"&&(!rule.property_key||rule.permitted_epistemic_status!=="observed"))ctx.addIssue({code:"custom",message:"auto_proposal_contract_invalid"});if(rule.site_check_boundary!== (rule.review_class==="site_check_only"))ctx.addIssue({code:"custom",message:"site_check_boundary_mismatch"});});

const resultBase={mapping_rule_version:z.literal(OBSERVATION_CLAIM_MAPPING_VERSION),observation_ids:z.array(uuid).min(1).readonly(),reason_codes:z.array(observationMappingReasonCodeSchema).min(1).readonly(),requires_human_review:z.boolean(),causes_state_change:z.literal(false),application_status:z.literal("not_applied")};
export const observationClaimMappingResultSchema=z.discriminatedUnion("kind",[
  z.object({...resultBase,kind:z.literal("claim_proposal"),review_class:z.literal("auto_proposable"),claim_proposal:knowledgeClaimProposalSchema,evidence_proposals:z.array(evidenceProposalSchema).min(1).readonly()}).strict(),
  ...(["observation_only","human_review_required","site_check_required","insufficient_evidence","unsupported_mapping","conflicting_observations","invalid_context"] as const).map(kind=>z.object({...resultBase,kind:z.literal(kind),review_class:observationReviewClassSchema.nullable()}).strict()),
] as [z.ZodDiscriminatedUnionOption<"kind">,...z.ZodDiscriminatedUnionOption<"kind">[]]);

export type ObservationClaimMappingRule=Readonly<z.infer<typeof observationClaimMappingRuleSchema>>;
export type ObservationSufficiency=Readonly<z.infer<typeof observationSufficiencySchema>>;
export type ObservationClaimMappingResult=Readonly<z.infer<typeof observationClaimMappingResultSchema>>;

const freeze=<T>(value:T):T=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){for(const child of Object.values(value as Record<string,unknown>))freeze(child);Object.freeze(value);}return value;};
type RuleSeed=Readonly<{target_key:ObservationClaimMappingRule["target_key"];observation_type:ObservationClaimMappingRule["observation_type"];review_class:ObservationClaimMappingRule["review_class"];reason:string;entity_type?:EntityType;quality?:EvidenceQuality;actors?:readonly ("admin"|"reviewer"|"ai")[]}>;
const seeds:readonly RuleSeed[]=[
  {target_key:"room_overview",observation_type:"room_overview_visible",review_class:"auto_observable",reason:"no_lossless_knowledge_property",entity_type:"room"},{target_key:"room_overview",observation_type:"window_visible",review_class:"auto_observable",reason:"descriptive_observation_only",entity_type:"room"},{target_key:"room_overview",observation_type:"door_visible",review_class:"auto_observable",reason:"descriptive_observation_only",entity_type:"room"},{target_key:"room_overview",observation_type:"wall_area_visible",review_class:"auto_observable",reason:"no_lossless_knowledge_property",entity_type:"room"},{target_key:"room_overview",observation_type:"measurement_reference_visible",review_class:"auto_observable",reason:"no_lossless_knowledge_property",entity_type:"room"},
  {target_key:"indoor_area_overview",observation_type:"possible_indoor_mounting_area_visible",review_class:"human_review_required",reason:"placement_not_determined",entity_type:"room"},{target_key:"outdoor_area_overview",observation_type:"possible_outdoor_mounting_area_visible",review_class:"human_review_required",reason:"placement_not_determined"},{target_key:"line_route_context",observation_type:"line_route_context_visible",review_class:"auto_observable",reason:"line_route_feasibility_not_observed"},{target_key:"line_route_context",observation_type:"wall_penetration_context_visible",review_class:"site_check_only",reason:"core_drilling_safety_site_check_only"},{target_key:"electrical_area",observation_type:"electrical_connection_visible",review_class:"site_check_only",reason:"electrical_suitability_site_check_only"},{target_key:"accessibility_context",observation_type:"accessibility_context_visible",review_class:"auto_observable",reason:"safe_access_not_observed"},
  {target_key:"indoor_area_overview",observation_type:"indoor_area_visible",review_class:"auto_observable",reason:"descriptive_observation_only",entity_type:"room"},{target_key:"outdoor_area_overview",observation_type:"outdoor_area_visible",review_class:"auto_observable",reason:"descriptive_observation_only"},{target_key:"outdoor_area_overview",observation_type:"accessibility_context_visible",review_class:"auto_observable",reason:"safe_access_not_observed"},
];
const rules=seeds.map(seed=>observationClaimMappingRuleSchema.parse({rule_key:`v1:${seed.target_key}:${seed.observation_type}:visible:${seed.entity_type??"installation"}:none`,version:1,target_key:seed.target_key,observation_type:seed.observation_type,observation_value:"visible",entity_type:seed.entity_type??"installation",property_key:null,review_class:seed.review_class,permitted_property:null,permitted_epistemic_status:null,minimum_evidence_quality:seed.quality??"sufficient_for_observation",allowed_source_actors:seed.actors??["admin","reviewer","ai"],reason_codes:[seed.reason],site_check_boundary:seed.review_class==="site_check_only"}));
export const OBSERVATION_CLAIM_MAPPING_REGISTRY:readonly ObservationClaimMappingRule[]=freeze(rules);
export const SITE_CHECK_ONLY_BOUNDARIES=freeze(["electrical_suitability","core_drilling_safety","hidden_services","structural_safety","legal_noise_assessment","final_mounting_approval"] as const);

const qualityBlocked=(quality:EvidenceQuality)=>quality!=="sufficient_for_observation";
export function assessObservationClaimSufficiency(observations:readonly EvidenceObservation[],rule:ObservationClaimMappingRule,actor:"admin"|"reviewer"|"ai"):ObservationSufficiency{
  if(!rule.allowed_source_actors.includes(actor))return freeze({kind:"human_review_required",reason_codes:["actor_not_permitted"]});
  if(observations.some(item=>qualityBlocked(item.evidence_quality)))return freeze({kind:"insufficient",reason_codes:[observations.some(item=>item.evidence_quality==="ambiguous")?"evidence_ambiguous":"evidence_quality_insufficient"]});
  if(rule.requires_observation_set&&!rule.requires_observation_set.every(key=>observations.some(item=>item.observation_type===key)))return freeze({kind:"insufficient",reason_codes:["explicit_observation_set_required"]});
  return freeze({kind:rule.review_class==="site_check_only"?"site_check_required":rule.review_class==="human_review_required"?"human_review_required":rule.review_class==="auto_proposable"?"sufficient_for_proposal":"observation_only",reason_codes:rule.reason_codes});
}

export const observationClaimProposalInputSchema=z.object({observations:z.array(evidenceObservationSchema).min(1).readonly(),project_id:uuid,conversation_id:uuid,entity_type:z.enum(ENTITY_TYPES),entity_id:uuid,knowledge_state:knowledgeStateSchema,proposal_ids:z.object({claim_id:uuid,evidence_id:uuid}).strict(),occurred_at:timestamp}).strict();
type ProposalInput=z.infer<typeof observationClaimProposalInputSchema>;
const noClaim=(kind:Exclude<ObservationClaimMappingResult["kind"],"claim_proposal">,ids:readonly string[],reason_codes:readonly (typeof OBSERVATION_MAPPING_REASON_CODES[number])[],review_class:ObservationClaimMappingRule["review_class"]|null,review=false):ObservationClaimMappingResult=>freeze(observationClaimMappingResultSchema.parse({kind,mapping_rule_version:1,observation_ids:ids,reason_codes,review_class,requires_human_review:review,causes_state_change:false,application_status:"not_applied"}));
export function proposeKnowledgeClaimFromObservation(input:unknown):ObservationClaimMappingResult{
  const parsed=observationClaimProposalInputSchema.safeParse(input);if(!parsed.success)return noClaim("invalid_context",["00000000-0000-4000-8000-000000000000"],["invalid_observation_context"],null);
  const value:ProposalInput=parsed.data, observations=value.observations,first=observations[0],ids=observations.map(item=>item.observation_id);
  if(value.project_id!==value.knowledge_state.project_id||first.project_id!==value.project_id||first.conversation_id!==value.conversation_id||observations.some(item=>item.project_id!==first.project_id||item.conversation_id!==first.conversation_id||item.target_key!==first.target_key))return noClaim("invalid_context",ids,["invalid_observation_context"],null);
  if(observations.some((item,index)=>observations.slice(index+1).some(other=>other.observation_type===item.observation_type&&JSON.stringify(other.observation_value)!==JSON.stringify(item.observation_value))))return noClaim("conflicting_observations",ids,["observation_conflict"],null,true);
  if(first.evidence_quality==="wrong_target"||first.observation_type==="image_wrong_area")return noClaim("invalid_context",ids,["wrong_target"],null);
  if(first.observation_type.startsWith("image_")||qualityBlocked(first.evidence_quality))return noClaim("insufficient_evidence",ids,[first.evidence_quality==="ambiguous"?"evidence_ambiguous":"evidence_quality_insufficient"],null,first.evidence_quality==="ambiguous");
  const observationValue=first.observation_value.kind==="visibility"?first.observation_value.value:null;
  const rule=OBSERVATION_CLAIM_MAPPING_REGISTRY.find(item=>item.target_key===first.target_key&&item.observation_type===first.observation_type&&item.observation_value===observationValue&&item.entity_type===value.entity_type);
  if(!rule)return noClaim("unsupported_mapping",ids,["mapping_not_supported"],null);
  const sufficiency=assessObservationClaimSufficiency(observations,rule,first.source_actor_class);
  if(sufficiency.kind!=="sufficient_for_proposal")return noClaim(sufficiency.kind==="site_check_required"?"site_check_required":sufficiency.kind==="human_review_required"?"human_review_required":sufficiency.kind==="insufficient"?"insufficient_evidence":"observation_only",ids,sufficiency.reason_codes,rule.review_class,sufficiency.kind==="human_review_required");
  // There is deliberately no MVP auto-proposable rule until a lossless descriptive property exists.
  return noClaim("unsupported_mapping",ids,["mapping_not_supported"],rule.review_class);
}
