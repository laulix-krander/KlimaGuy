import { knowledgeStateSchema, type KnowledgeClaim, type KnowledgeState } from "./schemas";
import type { EntityType, EpistemicStatus, PropertyKey } from "./types";

export const SYNTHETIC_IDS = { project: "10000000-0000-4000-8000-000000000001", conversation: "10000000-0000-4000-8000-000000000002", room: "10000000-0000-4000-8000-000000000003", installation: "10000000-0000-4000-8000-000000000004" } as const;
const AT = "2026-08-06T10:00:00.000Z";
let idCounter = 10;
const id = () => `10000000-0000-4000-8000-${String(idCounter++).padStart(12, "0")}`;
function claim(entity_type: EntityType, property_key: PropertyKey, value: string | number | boolean | null, epistemic_status: EpistemicStatus): KnowledgeClaim {
  const claimId = id();
  const value_type = value === null ? "unknown" : typeof value;
  return { claim_id: claimId, project_id: SYNTHETIC_IDS.project, entity_type, entity_id: entity_type === "project" ? SYNTHETIC_IDS.project : entity_type === "room" ? SYNTHETIC_IDS.room : SYNTHETIC_IDS.installation, property_key, value, value_type, epistemic_status, evidence: [{ evidence_id: id(), source_type: epistemic_status === "assumed" ? "system_rule" : "customer_message", source_id: id(), actor_class: epistemic_status === "assumed" ? "system" : "customer", observed_at: AT, evidence_status: "active" }], created_at: AT, state_version: 1 } as KnowledgeClaim;
}
function state(claims: KnowledgeClaim[]): KnowledgeState { return knowledgeStateSchema.parse({ project_id: SYNTHETIC_IDS.project, conversation_id: SYNTHETIC_IDS.conversation, state_version: 1, claims, updated_at: AT }); }
const a = [claim("project", "desired_installation_scope", "ein_innengeraet", "reported"), claim("project", "requested_room_count", 1, "reported"), claim("room", "room_type", "wohnzimmer", "reported")];
const b = [...a, claim("room", "room_area_sqm", 28, "estimated"), claim("project", "building_type", "einfamilienhaus", "reported")];
const c = [...b, claim("room", "indoor_unit_position_known", true, "reported"), claim("installation", "outdoor_unit_position_known", null, "requires_site_check"), claim("installation", "line_route_known", false, "assumed")];
const d = [...c, claim("installation", "estimated_line_length_m", 6, "estimated"), claim("installation", "core_drilling_count", 1, "estimated"), claim("installation", "condensate_route_known", true, "estimated"), claim("installation", "electrical_supply_known", true, "reported"), claim("installation", "accessibility_known", true, "reported")];
export const SYNTHETIC_SINGLE_ROOM_STATES = {
  A: state(a), B: state(b), C: state(c), D: state(d),
  E: state([...b, claim("room", "room_area_sqm", 35, "reported")]),
  F: state([...d.filter((item) => item.property_key !== "electrical_supply_known"), claim("installation", "electrical_supply_known", null, "requires_site_check")]),
} as const;
