import { describe, expect, it } from "vitest";
import {
  EVIDENCE_OBSERVATION_DEFINITIONS, EVIDENCE_OBSERVATION_TYPES, EVIDENCE_QUALITIES,
  TARGET_OBSERVATION_REGISTRY, createEvidenceObservationState, evidenceObservationSchema,
  evidenceObservationTypeSchema, evidenceQualitySchema, observationOptionsForTarget,
  recordEvidenceObservation,
} from "@/lib/domain/conversation-intelligence";

const PROJECT="91000000-0000-4000-8000-000000000001", CONVERSATION="91000000-0000-4000-8000-000000000002", EVIDENCE="91000000-0000-4000-8000-000000000003", REQUEST="91000000-0000-4000-8000-000000000004";
const availability={target_key:"outdoor_area_overview" as const,status:"available_unanalysed" as const,request_id:REQUEST,evidence_id:EVIDENCE};
const observation=(overrides:Record<string,unknown>={})=>({observation_id:"91000000-0000-4000-8000-000000000005",contract_version:1,evidence_id:EVIDENCE,project_id:PROJECT,conversation_id:CONVERSATION,target_key:"outdoor_area_overview",observation_category:"observation",observation_type:"outdoor_area_visible",observation_value:{kind:"visibility",value:"visible"},source_actor_class:"admin",observed_at:"2026-08-20T12:00:00.000Z",evidence_quality:"sufficient_for_observation",interpretation_status:"observed",scope:{request_id:REQUEST,scope_key:"requested_target"},reason_codes:["visible_feature_recorded"],...overrides});

describe("AP-15-04-01-10 Evidence Observation",()=>{
  it("validiert den strikt geschlossenen, PII-freien Contract",()=>{
    expect(evidenceObservationSchema.parse(observation())).toEqual(observation());
    expect(evidenceObservationSchema.safeParse({...observation(),url:"https://example.invalid"}).success).toBe(false);
    expect(evidenceObservationSchema.safeParse({...observation(),observation_id:"bad"}).success).toBe(false);
    expect(evidenceObservationSchema.safeParse({...observation(),observed_at:"heute"}).success).toBe(false);
    expect(evidenceObservationSchema.safeParse({...observation(),source_actor_class:"customer"}).success).toBe(false);
    expect(evidenceObservationSchema.safeParse({...observation(),observation_category:"hypothesis"}).success).toBe(false);
  });
  it("schließt Types und Quality statisch und technisch sicher",()=>{
    expect(evidenceQualitySchema.safeParse("sufficient_for_observation").success).toBe(true);
    expect(EVIDENCE_QUALITIES).not.toContain("confidence");
    for(const forbidden of ["electrical_supply_suitable","core_drilling_safe","outdoor_position_approved","line_route_feasible","safe_access_confirmed","installation_approved","mounting_safe"]){expect(evidenceObservationTypeSchema.safeParse(forbidden).success).toBe(false);expect(EVIDENCE_OBSERVATION_TYPES).not.toContain(forbidden);}
    expect(evidenceObservationTypeSchema.safeParse("electrical_connection_visible").success).toBe(true);
  });
  it("bindet alle sechs aktiven Targets an eindeutige, immutable Optionen",()=>{
    expect(Object.keys(TARGET_OBSERVATION_REGISTRY)).toEqual(["room_overview","indoor_area_overview","outdoor_area_overview","line_route_context","electrical_area","accessibility_context"]);
    for(const values of Object.values(TARGET_OBSERVATION_REGISTRY))expect(new Set(values).size).toBe(values.length);
    expect(Object.isFrozen(TARGET_OBSERVATION_REGISTRY)).toBe(true);expect(Object.isFrozen(TARGET_OBSERVATION_REGISTRY.electrical_area)).toBe(true);expect(Object.isFrozen(EVIDENCE_OBSERVATION_DEFINITIONS)).toBe(true);
    expect(observationOptionsForTarget("electrical_area")).toContain("electrical_connection_visible");expect(observationOptionsForTarget("room_overview")).not.toContain("electrical_connection_visible");
  });
  it("zeichnet mehrere Observations immutable auf und behandelt Replay idempotent",()=>{
    const state=createEvidenceObservationState(PROJECT,CONVERSATION);const first=recordEvidenceObservation({state,availability,observation:observation()});expect(first).toMatchObject({success:true,changed:true,code:"observation_recorded"});if(!first.success)return;
    expect(state.revision).toBe(0);expect(first.state.revision).toBe(1);expect(Object.isFrozen(first.state.observations)).toBe(true);
    const replay=recordEvidenceObservation({state:first.state,availability,observation:observation()});expect(replay).toMatchObject({success:true,changed:false,code:"observation_replayed"});if(!replay.success)return;expect(replay.state.revision).toBe(1);
    const second=recordEvidenceObservation({state:first.state,availability,observation:observation({observation_id:"91000000-0000-4000-8000-000000000006",observation_type:"possible_outdoor_mounting_area_visible"})});expect(second).toMatchObject({success:true,changed:true});if(second.success)expect(second.state.observations).toHaveLength(2);
  });
  it.each([["image_insufficient","insufficient","insufficient","insufficient_view"],["image_obstructed","obstructed","requires_review","view_obstructed"],["image_wrong_area","wrong_target","rejected","wrong_target_shown"]] as const)("erlaubt kontrollierte Bad-Evidence-Observation %s",(type,quality,status,reason)=>{
    const parsed=evidenceObservationSchema.safeParse(observation({observation_type:type,observation_value:{kind:"evidence_condition",value:null},evidence_quality:quality,interpretation_status:status,reason_codes:[reason]}));expect(parsed.success).toBe(true);
  });
  it("weist falsches Target, fehlende Availability, Bindungsfehler und Duplikatsemantik ab",()=>{
    const state=createEvidenceObservationState(PROJECT,CONVERSATION);
    expect(recordEvidenceObservation({state,availability,observation:observation({observation_type:"electrical_connection_visible"})})).toMatchObject({success:false,code:"observation_not_allowed"});
    expect(recordEvidenceObservation({state,availability:{...availability,status:"requested"},observation:observation()})).toMatchObject({success:false,code:"evidence_not_available"});
    expect(recordEvidenceObservation({state,availability:{...availability,evidence_id:undefined},observation:observation()})).toMatchObject({success:false,code:"evidence_identity_invalid"});
    const first=recordEvidenceObservation({state,availability,observation:observation()});if(!first.success)return;
    expect(recordEvidenceObservation({state:first.state,availability,observation:observation({observation_id:"91000000-0000-4000-8000-000000000007"})})).toMatchObject({success:false,code:"duplicate_observation_semantics"});
  });
  it("bewahrt Admin-/Reviewer-Ursprung ohne AI-Supersessionsemantik",()=>{expect(evidenceObservationSchema.parse(observation()).source_actor_class).toBe("admin");expect(evidenceObservationSchema.parse(observation({source_actor_class:"reviewer"})).source_actor_class).toBe("reviewer");});
});
