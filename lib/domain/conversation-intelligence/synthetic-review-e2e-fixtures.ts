import { createDescriptiveClaimReviewState, reviewDescriptiveClaimProposal, type DescriptiveClaimReviewAction } from "./descriptive-claim-review";
import { createEvidenceObservationState, recordEvidenceObservation, type EvidenceObservationType } from "./evidence-observation";
import { appendPlannedEvidenceRequest, planEvidenceRequest, resolveSyntheticEvidenceRequest, type EvidencePlanningNeed, type EvidenceTargetKey } from "./evidence-request";
import { assessInformationGain } from "./information-gain";
import { proposeKnowledgeClaimFromObservation } from "./observation-claim-mapping";
import { derivePlannerEvidenceContext } from "./planner-evidence-context";
import { deriveMissingInformation, deriveReadiness } from "./readiness";
import type { KnowledgeClaim, KnowledgeState } from "./schemas";
import type { EntityType, PropertyKey } from "./types";

const AT = "2026-08-21T12:00:00.000Z";
const PROJECT = "c1000000-0000-4000-8000-000000000001";
const CONVERSATION = "c1000000-0000-4000-8000-000000000002";
const ROOM = "c1000000-0000-4000-8000-000000000003";
const INSTALLATION = "c1000000-0000-4000-8000-000000000004";
const REVIEWER = "c1000000-0000-4000-8000-000000000005";

export const SYNTHETIC_REVIEW_ENTITY_CASES = Object.freeze([
  { key:"room", property_key:"room_overview_context_observed", technical_need:"room_area_sqm", entity_type:"room", entity_id:ROOM, request_target:"room_overview", observation_type:"room_overview_visible", dependencies:[] },
  { key:"indoor", property_key:"indoor_installation_area_observed", technical_need:"indoor_unit_position_known", entity_type:"room", entity_id:ROOM, request_target:"indoor_area_overview", observation_type:"indoor_area_visible", dependencies:["room_type"] },
  { key:"outdoor", property_key:"outdoor_installation_area_observed", technical_need:"outdoor_unit_position_known", entity_type:"installation", entity_id:INSTALLATION, request_target:"outdoor_area_overview", observation_type:"outdoor_area_visible", dependencies:["building_type"] },
  { key:"line_route", property_key:"line_route_context_observed", technical_need:"line_route_known", entity_type:"installation", entity_id:INSTALLATION, request_target:"line_route_context", observation_type:"line_route_context_visible", dependencies:["indoor_unit_position_known","outdoor_unit_position_known"] },
  { key:"wall_penetration", property_key:"wall_penetration_context_observed", technical_need:"line_route_known", entity_type:"installation", entity_id:INSTALLATION, request_target:"line_route_context", observation_type:"wall_penetration_context_visible", dependencies:["indoor_unit_position_known","outdoor_unit_position_known"] },
] as const);

export type SyntheticReviewEntityCase = typeof SYNTHETIC_REVIEW_ENTITY_CASES[number];
export type SyntheticReviewOutcome = "approval"|"reject"|"insufficient"|"conflict"|"stale";
const uid=(group:number,index:number)=>`c9000000-0000-4000-8000-${String(group*100+index).padStart(12,"0")}`;
const emptyState=():KnowledgeState=>({project_id:PROJECT,conversation_id:CONVERSATION,state_version:1,claims:[],updated_at:AT});
const requestState=()=>({project_id:PROJECT,conversation_id:CONVERSATION,requests:[],revision:0});
const need=(fixture:SyntheticReviewEntityCase):EvidencePlanningNeed=>({information_key:fixture.technical_need,entity_type:fixture.entity_type,entity_id:fixture.entity_id,open:true,collection_path:"future_photo_request"});
const conflictingClaim=(fixture:SyntheticReviewEntityCase):KnowledgeClaim=>({claim_id:uid(8,1),project_id:PROJECT,entity_type:fixture.entity_type,entity_id:fixture.entity_id,property_key:fixture.property_key,value:false,value_type:"boolean",epistemic_status:"observed",knowledge_strength:"descriptive_fact",evidence:[{evidence_id:uid(8,2),source_type:"manual_entry",source_id:uid(8,3),actor_class:"admin",observed_at:AT,evidence_status:"active"}],created_at:AT,state_version:1});

/** Runs only existing public domain boundaries; fixed IDs/times make it a replayable simulator/test fixture. */
export function runSyntheticReviewE2E(fixture:SyntheticReviewEntityCase, outcome:SyntheticReviewOutcome="approval") {
  const initial=emptyState();
  const before={knowledge_state:structuredClone(initial),missing_information:deriveMissingInformation(initial),readiness:deriveReadiness(initial)};
  const planned=planEvidenceRequest({project_id:PROJECT,conversation_id:CONVERSATION,request_id:uid(2,1),needs:[need(fixture)],request_state:requestState(),availability:[],evidence_context:[],available_dependency_keys:fixture.dependencies,human_review_required:false,site_check_authoritative:false,consecutive_evidence_requests:0,total_evidence_requests:0});
  if(planned.kind!=="evidence_request_selected"||planned.request.target_key!==fixture.request_target)throw new Error("synthetic_e2e_request_not_selected");
  const requested=appendPlannedEvidenceRequest(requestState(),planned.request,AT);
  const provided=resolveSyntheticEvidenceRequest(requested,planned.request.request_id,"provided",AT);
  if(!provided.availability)throw new Error("synthetic_e2e_evidence_not_available");
  const observation={observation_id:uid(3,1),contract_version:1 as const,evidence_id:provided.availability.evidence_id!,project_id:PROJECT,conversation_id:CONVERSATION,target_key:fixture.request_target as EvidenceTargetKey,observation_category:"observation" as const,observation_type:fixture.observation_type as EvidenceObservationType,observation_value:{kind:"visibility" as const,value:"visible" as const},source_actor_class:"admin" as const,observed_at:AT,evidence_quality:"sufficient_for_observation" as const,interpretation_status:"observed" as const,scope:{request_id:planned.request.request_id,scope_key:"requested_target" as const},reason_codes:["visible_feature_recorded" as const]};
  const recorded=recordEvidenceObservation({state:createEvidenceObservationState(PROJECT,CONVERSATION),availability:provided.availability,observation});
  if(!recorded.success)throw new Error("synthetic_e2e_observation_failed");
  const mapped=proposeKnowledgeClaimFromObservation({observations:[recorded.observation],project_id:PROJECT,conversation_id:CONVERSATION,entity_type:fixture.entity_type as EntityType,entity_id:fixture.entity_id,knowledge_state:initial,proposal_ids:{claim_id:uid(4,1),evidence_id:uid(4,2)},occurred_at:AT});
  if(mapped.kind!=="claim_proposal")throw new Error("synthetic_e2e_mapping_failed");
  const reviewBase=outcome==="conflict"?{...initial,claims:[conflictingClaim(fixture)]}:outcome==="stale"?{...initial,state_version:2,updated_at:"2026-08-21T12:01:00.000Z"}:initial;
  const action:DescriptiveClaimReviewAction=outcome==="reject"?"reject":outcome==="insufficient"?"mark_evidence_insufficient":"approve";
  const review=reviewDescriptiveClaimProposal({command:{project_id:PROJECT,conversation_id:CONVERSATION,proposal_id:mapped.claim_proposal.claim_id,expected_knowledge_state_version:1,review_action:action,review_actor_class:"admin",review_actor_id:REVIEWER,reviewed_at:AT},current_state:reviewBase,review_state:createDescriptiveClaimReviewState(PROJECT,CONVERSATION),proposals:[mapped.claim_proposal],transition_id:uid(5,1),apply_id:uid(5,2)});
  const evidence_context=derivePlannerEvidenceContext(review.knowledge_state);
  const technicalNeed=need(fixture);
  const replanned=planEvidenceRequest({project_id:PROJECT,conversation_id:CONVERSATION,request_id:uid(6,1),needs:[technicalNeed],request_state:outcome==="approval"?requestState():provided.state,availability:outcome==="approval"?[]:[provided.availability],evidence_context,available_dependency_keys:fixture.dependencies,human_review_required:false,site_check_authoritative:false,consecutive_evidence_requests:0,total_evidence_requests:0});
  const gain=assessInformationGain({project_id:PROJECT,conversation_id:CONVERSATION,information_key:fixture.technical_need,entity_type:fixture.entity_type,entity_id:fixture.entity_id,knowledge_state_version:review.knowledge_state.state_version,collection_state_version:0,attempts:1,collection_status:"requires_additional_evidence",last_answer_meaning:"requires_additional_evidence",dependency_signature:{},available_evidence_channels:{customer_question:false,customer_clarification:false,existing_evidence:false,future_photo_request:true,future_document_request:false,assumption:false,site_check:false,human_review:false},evidence_target_key:fixture.request_target,evidence_context});
  return {fixture,outcome,before,evidence_request_state:provided.state,evidence_availability:provided.availability,observation_state:recorded.state,proposal:mapped.claim_proposal,review,after:{knowledge_state:review.knowledge_state,evidence_context,missing_information:deriveMissingInformation(review.knowledge_state),readiness:deriveReadiness(review.knowledge_state),information_gain:gain,planner_result:replanned}} as const;
}
