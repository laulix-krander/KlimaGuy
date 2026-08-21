import { describe, expect, it } from "vitest";
import {
  PLANNER_EVIDENCE_CONTEXT_REGISTRY, SYNTHETIC_IDS, deriveMissingInformation,
  derivePlannerEvidenceContext, deriveReadiness, planEvidenceRequest,
  plannerEvidenceContextEntrySchema, plannerEvidenceContextSchema,
  type EvidencePlanningNeed, type KnowledgeClaim, type KnowledgeState, type PropertyKey,
} from "@/lib/domain/conversation-intelligence";

const AT="2026-08-21T10:00:00.000Z", REQUEST="b1000000-0000-4000-8000-000000000001";
const properties=[
  ["room_overview_context_observed","room_overview","room_area_sqm",[]],
  ["indoor_installation_area_observed","indoor_area_overview","indoor_unit_position_known",["room_type"]],
  ["outdoor_installation_area_observed","outdoor_area_overview","outdoor_unit_position_known",["building_type"]],
  ["line_route_context_observed","line_route_context","line_route_known",["indoor_unit_position_known","outdoor_unit_position_known"]],
  ["wall_penetration_context_observed","core_drilling_context","core_drilling_count",[]],
] as const;
const claim=(property:typeof properties[number][0],index=0):KnowledgeClaim=>({claim_id:`b2000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,project_id:SYNTHETIC_IDS.project,entity_type:property.startsWith("room_")||property.startsWith("indoor_")?"room":"installation",entity_id:SYNTHETIC_IDS.installation,property_key:property,value:true,value_type:"boolean",epistemic_status:"observed",knowledge_strength:"descriptive_fact",evidence:[{evidence_id:`b3000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,source_id:`b4000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,source_type:"manual_entry",actor_class:"admin",observed_at:AT,evidence_status:"active"}],created_at:AT,state_version:2});
const state=(claims:readonly KnowledgeClaim[]=[]):KnowledgeState=>({project_id:SYNTHETIC_IDS.project,conversation_id:SYNTHETIC_IDS.conversation,state_version:2,claims,updated_at:AT});
const need=(key:PropertyKey):EvidencePlanningNeed=>({information_key:key,entity_type:key==="room_area_sqm"?"room":"installation",entity_id:SYNTHETIC_IDS.installation,open:true,collection_path:"future_photo_request"});
const plan=(n:EvidencePlanningNeed,context:ReturnType<typeof derivePlannerEvidenceContext>,deps:readonly PropertyKey[] =[])=>planEvidenceRequest({project_id:SYNTHETIC_IDS.project,conversation_id:SYNTHETIC_IDS.conversation,request_id:REQUEST,needs:[n],request_state:{project_id:SYNTHETIC_IDS.project,conversation_id:SYNTHETIC_IDS.conversation,requests:[],revision:0},availability:[],evidence_context:context,available_dependency_keys:deps,human_review_required:false,site_check_authoritative:false,consecutive_evidence_requests:0,total_evidence_requests:0});

describe("AP-15-04-01-12-03-02 Planner Evidence Context",()=>{
  it("hält den vollständigen Vertrag strikt, statisch und tief immutable",()=>{expect(PLANNER_EVIDENCE_CONTEXT_REGISTRY).toHaveLength(5);expect(Object.isFrozen(PLANNER_EVIDENCE_CONTEXT_REGISTRY)).toBe(true);expect(PLANNER_EVIDENCE_CONTEXT_REGISTRY.every(item=>Object.isFrozen(item)&&Object.isFrozen(item.covered_target_keys))).toBe(true);expect(plannerEvidenceContextEntrySchema.safeParse({...derivePlannerEvidenceContext(state([claim(properties[0][0])]))[0],extra:true}).success).toBe(false);expect(plannerEvidenceContextSchema.safeParse([{context_key:"frei"}]).success).toBe(false)});
  it.each(properties)("mappt %s ausschließlich auf %s und blockiert den identischen Request",(property,target,key,deps)=>{const before=state(),after=state([claim(property)]),context=derivePlannerEvidenceContext(after);expect(context).toEqual([{...PLANNER_EVIDENCE_CONTEXT_REGISTRY.find(item=>item.property_key===property),entity_type:property.startsWith("room_")||property.startsWith("indoor_")?"room":"installation",entity_id:SYNTHETIC_IDS.installation}]);expect(context[0].covered_target_keys).toEqual([target]);expect(plan(need(key),context,deps)).toEqual({kind:"no_evidence_request",reason:"existing_descriptive_evidence_context"});expect(deriveMissingInformation(after)).toEqual(deriveMissingInformation(before));expect(deriveReadiness(after)).toEqual(deriveReadiness(before));});
  it("dedupliziert nicht targetübergreifend und hält Request-History getrennt",()=>{const room=derivePlannerEvidenceContext(state([claim("room_overview_context_observed")]));expect(plan(need("line_route_known"),room,["indoor_unit_position_known","outdoor_unit_position_known"])).toMatchObject({kind:"evidence_request_selected",request:{target_key:"line_route_context"}});const outdoor=derivePlannerEvidenceContext(state([claim("outdoor_installation_area_observed")]));expect(plan(need("accessibility_known"),outdoor,["indoor_unit_position_known"])).toMatchObject({kind:"evidence_request_selected",request:{target_key:"accessibility_context"}});expect(plan(need("outdoor_unit_position_known"),outdoor,["building_type"])).toEqual(plan(need("outdoor_unit_position_known"),outdoor,["building_type"]));});
  it("ignoriert nicht wirksame oder technisch andersartige Claims",()=>{const invalid=[{...claim("outdoor_installation_area_observed"),evidence:[{...claim("outdoor_installation_area_observed").evidence[0],evidence_status:"invalidated" as const}]}];expect(derivePlannerEvidenceContext(state(invalid))).toEqual([]);expect(derivePlannerEvidenceContext(state())).toEqual([]);});
});
