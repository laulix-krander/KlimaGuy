import type { MessageDto, ConversationDto } from "./conversation-authority";
import { MVP_PROJECT_FACT_KEYS, type MvpProjectFact, type MvpProjectFactKey } from "./mvp-project-facts";
import { evaluateMvpQualificationReadiness } from "./mvp-qualification-readiness";
import type { ProjectStatus } from "./types";

export const UNKNOWN_CUSTOMER_NAME = "Name noch unbekannt";

export const FACT_DISPLAY = {
  installation_address: ["Objekt", "Installationsadresse"], postal_code: ["Objekt", "Postleitzahl"], city: ["Objekt", "Ort"], building_type: ["Objekt", "Gebäudeart"], floor_level: ["Objekt", "Etage"],
  requested_room_count: ["Raum", "Gewünschte Räume"], room_type: ["Raum", "Raumtyp"], room_area_sqm: ["Raum", "Fläche"],
  indoor_unit_count: ["Geräte", "Innengeräte"], indoor_unit_position: ["Geräte", "Innenposition"], outdoor_unit_position: ["Geräte", "Außenposition"],
  line_route: ["Installation", "Leitungsweg"], estimated_line_length_m: ["Installation", "Leitungslänge"], core_drilling_count: ["Installation", "Kernbohrungen"], condensate_drainage: ["Installation", "Kondensat"], electrical_supply: ["Installation", "Elektrik"], installation_access: ["Installation", "Zugang"],
  existing_air_conditioning: ["Weitere Angaben", "Bestehende Klimaanlage"], customer_preferences: ["Weitere Angaben", "Präferenzen"], additional_installation_notes: ["Weitere Angaben", "Hinweise"], required_photo_categories: ["Weitere Angaben", "Fotoanforderungen"],
} as const satisfies Record<MvpProjectFactKey, readonly [string, string]>;

const VALUE_LABELS: Readonly<Record<string, string>> = {
  apartment: "Wohnung", single_family_house: "Einfamilienhaus", multi_family_house: "Mehrfamilienhaus", other: "Sonstiges",
  living_room: "Wohnzimmer", bedroom: "Schlafzimmer", office: "Büro", kitchen: "Küche",
  available: "Vorhanden (technische Eignung ungeprüft)", not_available: "Nicht vorhanden", unknown: "Unbekannt", requires_site_check: "Vor-Ort-Prüfung erforderlich",
  standard_ladder: "Standardleiter ausreichend", special_access_required: "Sonderzugang erforderlich",
  room_overview: "Raumübersicht", indoor_unit_location: "Position Innengerät", outdoor_unit_location: "Position Außengerät", pipe_route: "Leitungsweg", electrical_connection: "Elektroanschluss", condensate_route: "Kondensatweg",
};

export function customerDisplayName(customer: { first_name: string | null; last_name: string | null } | null): string {
  return [customer?.first_name, customer?.last_name].filter((part): part is string => Boolean(part?.trim())).join(" ") || UNKNOWN_CUSTOMER_NAME;
}

export function displayFactValue(fact: MvpProjectFact | undefined): string {
  if (!fact) return "Noch nicht bekannt";
  const value = fact.value;
  if (Array.isArray(value)) return value.length ? value.map((item) => VALUE_LABELS[String(item)] ?? "Unbekannte Angabe").join(", ") : "Keine angegeben";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") return `${value}${fact.key === "room_area_sqm" ? " m²" : fact.key === "estimated_line_length_m" ? " m" : ""}`;
  return VALUE_LABELS[value] ?? value;
}

export function mapFactDisplay(facts: readonly MvpProjectFact[]) {
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  return MVP_PROJECT_FACT_KEYS.map((key) => ({ key, group: FACT_DISPLAY[key][0], label: FACT_DISPLAY[key][1], value: displayFactValue(byKey.get(key)), known: byKey.has(key) }));
}

export function qualificationDisplay(facts: readonly MvpProjectFact[]) {
  const readiness = evaluateMvpQualificationReadiness(facts);
  const required = 6;
  return { ...readiness, completed: required - readiness.missingFacts.length, required, percent: Math.round(((required - readiness.missingFacts.length) / required) * 100), missingLabels: readiness.missingFacts.map((key) => FACT_DISPLAY[key][1]) };
}

export type InboxSource = { id: string; title: string; status: ProjectStatus; requires_human_review: boolean; city: string | null; postal_code: string | null; created_at: string; updated_at: string; customer: { first_name: string | null; last_name: string | null } | null; facts: readonly MvpProjectFact[]; latest_activity_at?: string | null };
export function mapProjectInbox(source: readonly InboxSource[], filters: { query?: string; status?: string; review?: string } = {}) {
  const query = filters.query?.trim().toLocaleLowerCase("de-DE") ?? "";
  return source.map((item) => ({ ...item, customerName: customerDisplayName(item.customer), qualification: qualificationDisplay(item.facts), latestActivityAt: item.latest_activity_at ?? item.updated_at }))
    .filter((item) => !query || [item.customerName, item.title, item.city, item.postal_code].some((value) => value?.toLocaleLowerCase("de-DE").includes(query)))
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.review || String(item.requires_human_review) === filters.review)
    .sort((a, b) => Number(b.requires_human_review) - Number(a.requires_human_review) || Date.parse(b.latestActivityAt) - Date.parse(a.latestActivityAt) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export type ConversationWorkspace = ConversationDto & { historical: boolean; messages: Array<MessageDto & { speaker: "Kunde" | "KlimaGuy" | "Intern"; mediaUrl: string | null }> };
export function mapConversationWorkspace(conversations: readonly ConversationDto[], messages: readonly MessageDto[], mediaByMessageId: ReadonlyMap<string, string>): ConversationWorkspace[] {
  const currentOpenId = conversations.find((item) => item.status !== "closed")?.conversation_id;
  return [...conversations].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map((conversation) => ({
    ...conversation, historical: conversation.status === "closed" || (!!currentOpenId && conversation.conversation_id !== currentOpenId),
    messages: messages.filter((message) => message.conversation_id === conversation.conversation_id).sort((a, b) => a.sequence - b.sequence).map((message) => ({ ...message, speaker: message.direction === "inbound" ? "Kunde" : message.direction === "outbound" ? "KlimaGuy" : "Intern", mediaUrl: mediaByMessageId.get(message.message_id) ?? null })),
  }));
}
