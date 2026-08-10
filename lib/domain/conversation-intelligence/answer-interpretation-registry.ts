import type { MappingRule } from "./answer-interpretation-types";

const freeze = <T extends object>(value: T): Readonly<T> => { for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child); return Object.freeze(value); };
const common={epistemic_status:"reported",unknown_strategy:"null_claim",skip_strategy:"no_property_claim",contradiction_strategy:"parallel_claim",supersession_strategy:"controlled",evidence_source_type:"customer_message",supports_assumption:false,status:"active"} as const;
const booleanRule=(information_key:MappingRule["information_key"],entity_type:MappingRule["entity_type"],semantic_mode:MappingRule["semantic_mode"],yes:NonNullable<MappingRule["meanings"]>["yes"],no:NonNullable<MappingRule["meanings"]>["no"]):MappingRule=>freeze({...common,information_key,entity_type,property_key:information_key,supported_normalized_kind:"boolean",semantic_mode,meanings:{yes,no,unknown:"leave_information_open",skip:"defer_collection"}});
const canonicalRule=(information_key:MappingRule["information_key"],entity_type:MappingRule["entity_type"],values:Record<string,string>):MappingRule=>freeze({...common,information_key,entity_type,property_key:information_key,supported_normalized_kind:"text",semantic_mode:"technical_property",canonical_values:values});
export const ROOM_TYPE_VALUES=freeze({wohnzimmer:"living_room",schlafzimmer:"bedroom",büro:"office",buero:"office",arbeitszimmer:"office",dachzimmer:"attic_room",dachgeschosszimmer:"attic_room",sonstiges:"other"});
export const BUILDING_TYPE_VALUES=freeze({einfamilienhaus:"single_family_house",doppelhaushälfte:"semi_detached_house",doppelhaushaelfte:"semi_detached_house",reihenhaus:"terraced_house",mehrfamilienhaus:"multi_family_house",wohnung:"apartment",gewerbe:"commercial",gewerbegebäude:"commercial",gewerbegebaeude:"commercial",sonstiges:"other"});
export const ANSWER_INTERPRETATION_REGISTRY:readonly MappingRule[]=freeze([
 freeze({...common,information_key:"room_area_sqm",entity_type:"room",property_key:"room_area_sqm",supported_normalized_kind:"number",supports_assumption:true,semantic_mode:"technical_property"}),
 booleanRule("indoor_unit_position_known","room","customer_preference","customer_can_provide","customer_does_not_know"),
 booleanRule("outdoor_unit_position_known","installation","customer_knowledge","customer_knows","customer_does_not_know"),
 booleanRule("line_route_known","installation","customer_knowledge","customer_knows","requires_additional_evidence"),
 booleanRule("electrical_supply_known","installation","customer_observation","technical_true","customer_does_not_know"),
 booleanRule("accessibility_known","installation","technical_property","technical_true","technical_false"),
 canonicalRule("room_type","room",ROOM_TYPE_VALUES),canonicalRule("building_type","project",BUILDING_TYPE_VALUES),
]);
export const ASSUMPTION_VALUE_REGISTRY=freeze({rough_room_area_for_level_2:{information_key:"room_area_sqm",value:25,value_type:"number",approximation:"approximate"}} as const);
export const getAnswerInterpretationRule=(key:string)=>ANSWER_INTERPRETATION_REGISTRY.find(i=>i.information_key===key);
export const validateAnswerInterpretationRegistry=(registry:readonly MappingRule[])=>new Set(registry.map(i=>i.information_key)).size===registry.length&&registry.every(i=>i.supported_normalized_kind!=="boolean"||Boolean(i.meanings));
