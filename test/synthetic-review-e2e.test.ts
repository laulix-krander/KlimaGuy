import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_REVIEW_ENTITY_CASES, createDescriptiveClaimReviewState, derivePlannerEvidenceContext,
  planEvidenceRequest, reviewDescriptiveClaimProposal, runSyntheticReviewE2E,
  type EvidencePlanningNeed, type KnowledgeClaim, type KnowledgeState,
} from "@/lib/domain/conversation-intelligence";

const fixture=SYNTHETIC_REVIEW_ENTITY_CASES[2];
const planCross=(state:KnowledgeState,key:EvidencePlanningNeed["information_key"],dependencies:readonly EvidencePlanningNeed["information_key"][]=[])=>planEvidenceRequest({project_id:state.project_id,conversation_id:state.conversation_id,request_id:"ca000000-0000-4000-8000-000000000001",needs:[{information_key:key,entity_type:"installation",entity_id:fixture.entity_id,open:true,collection_path:"future_photo_request"}],request_state:{project_id:state.project_id,conversation_id:state.conversation_id,requests:[],revision:0},availability:[],evidence_context:derivePlannerEvidenceContext(state),available_dependency_keys:dependencies,human_review_required:false,site_check_authoritative:false,consecutive_evidence_requests:0,total_evidence_requests:0});

describe("AP-15-04-01-12-03-03 synthetic review E2E",()=>{
  it.each(SYNTHETIC_REVIEW_ENTITY_CASES)("applied $key traverses request, availability, observation, proposal, review and context",entity=>{
    const result=runSyntheticReviewE2E(entity);
    expect(result.evidence_request_state.requests[0]).toMatchObject({target_key:entity.request_target,status:"provided"});
    expect(result.evidence_availability).toMatchObject({target_key:entity.request_target,status:"available_unanalysed"});
    expect(result.observation_state.observations[0]).toMatchObject({observation_type:entity.observation_type,interpretation_status:"observed"});
    expect(result.proposal).toMatchObject({property_key:entity.property_key,value:true,value_type:"boolean",knowledge_strength:"descriptive_fact",epistemic_status:"observed",based_on_state_version:1,proposed_state_version:2});
    expect(result.review).toMatchObject({code:"approved",changed:true,knowledge_state:{state_version:2}});
    expect(result.after.evidence_context).toHaveLength(1);
    expect(result.after.readiness).toEqual(result.before.readiness);
    expect(result.after.missing_information).toEqual(result.before.missing_information);
    expect(result.after.knowledge_state.claims.some(claim=>claim.property_key===entity.technical_need)).toBe(false);
  });

  it("proves the outdoor separation and blocks only the equivalent target",()=>{
    const result=runSyntheticReviewE2E(fixture);
    expect(result.after.knowledge_state.claims.at(-1)).toMatchObject({property_key:"outdoor_installation_area_observed",value:true});
    expect(result.after.evidence_context[0]).toMatchObject({context_key:"outdoor_installation_area",covered_target_keys:["outdoor_area_overview"]});
    expect(result.after.information_gain).toMatchObject({preferred_collection_path:"leave_open",reason_codes:expect.arrayContaining(["existing_descriptive_evidence_context"])});
    expect(result.after.planner_result).toEqual({kind:"no_evidence_request",reason:"existing_descriptive_evidence_context"});
    expect(planCross(result.after.knowledge_state,"accessibility_known",["indoor_unit_position_known"])).toMatchObject({kind:"evidence_request_selected",request:{target_key:"accessibility_context"}});
    expect(planCross(result.after.knowledge_state,"line_route_known",["indoor_unit_position_known","outdoor_unit_position_known"])).toMatchObject({kind:"evidence_request_selected",request:{target_key:"line_route_context"}});
    expect(planCross(result.after.knowledge_state,"electrical_supply_known")).toMatchObject({kind:"evidence_request_selected",request:{target_key:"electrical_area"}});
  });

  it.each([["reject","rejected"],["insufficient","insufficient_evidence"],["stale","stale_state"]] as const)("keeps knowledge technical state unchanged for %s",(outcome,code)=>{
    const result=runSyntheticReviewE2E(fixture,outcome);
    expect(result.review).toMatchObject({code,changed:false});
    expect(result.after.evidence_context).toEqual([]);
    expect(result.after.readiness).toEqual(result.before.readiness);
    expect(result.after.missing_information).toEqual(result.before.missing_information);
    if(outcome==="reject"||outcome==="insufficient")expect(result.review.review_state.revision).toBe(1);
    if(outcome==="stale")expect(result.review.review_state.revision).toBe(0);
    expect(result.after.planner_result).toMatchObject({kind:"no_evidence_request",reason:"duplicate_request"});
  });

  it("documents that a valid contradictory descriptive boolean cannot currently reach review",()=>{
    expect(()=>runSyntheticReviewE2E(fixture,"conflict")).toThrow("Invalid synthetic review aggregate");
  });

  it("separates request history from durable reviewed context",()=>{
    const rejected=runSyntheticReviewE2E(fixture,"reject"),approved=runSyntheticReviewE2E(fixture);
    expect(rejected.evidence_request_state.requests[0].status).toBe("provided");
    expect(rejected.after.evidence_context).toEqual([]);
    expect(approved.evidence_request_state.requests[0].status).toBe("provided");
    expect(approved.after.evidence_context).toHaveLength(1);
    expect(derivePlannerEvidenceContext({...approved.after.knowledge_state})).toEqual(approved.after.evidence_context);
  });

  it("is idempotent for approval replay and equivalent active claims",()=>{
    const first=runSyntheticReviewE2E(fixture);
    const command={project_id:first.after.knowledge_state.project_id,conversation_id:first.after.knowledge_state.conversation_id,proposal_id:first.proposal.claim_id,expected_knowledge_state_version:2,review_action:"approve" as const,review_actor_class:"admin" as const,review_actor_id:"c1000000-0000-4000-8000-000000000005",reviewed_at:"2026-08-21T12:00:00.000Z"};
    const replay=reviewDescriptiveClaimProposal({command,current_state:first.after.knowledge_state,review_state:first.review.review_state,proposals:[first.proposal],transition_id:"cb000000-0000-4000-8000-000000000001",apply_id:"cb000000-0000-4000-8000-000000000002"});
    expect(replay).toMatchObject({code:"already_applied",changed:false,knowledge_state:{state_version:2},review_state:{revision:1}});
    const equivalent:KnowledgeClaim={...first.after.knowledge_state.claims[0],state_version:1};
    const equivalentState:KnowledgeState={...first.before.knowledge_state,claims:[equivalent]};
    const noChange=reviewDescriptiveClaimProposal({command:{...command,expected_knowledge_state_version:1},current_state:equivalentState,review_state:createDescriptiveClaimReviewState(command.project_id,command.conversation_id),proposals:[first.proposal],transition_id:"cb000000-0000-4000-8000-000000000003",apply_id:"cb000000-0000-4000-8000-000000000004"});
    expect(noChange).toMatchObject({code:"no_change",changed:false,knowledge_state:{state_version:1,claims:[equivalent]},review_state:{revision:1}});
  });

  it("replays deterministically without mutating fixture definitions",()=>{
    const before=structuredClone(SYNTHETIC_REVIEW_ENTITY_CASES);
    expect(runSyntheticReviewE2E(fixture)).toEqual(runSyntheticReviewE2E(fixture));
    expect(SYNTHETIC_REVIEW_ENTITY_CASES).toEqual(before);
    expect(Object.isFrozen(SYNTHETIC_REVIEW_ENTITY_CASES)).toBe(true);
  });
});
