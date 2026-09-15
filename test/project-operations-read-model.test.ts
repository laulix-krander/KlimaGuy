import { describe, expect, it } from "vitest";
import { MVP_PROJECT_FACT_KEYS, type MvpProjectFact } from "@/lib/domain/mvp-project-facts";
import { FACT_DISPLAY, customerDisplayName, displayFactValue, mapConversationWorkspace, mapFactDisplay, mapProjectInbox, UNKNOWN_CUSTOMER_NAME } from "@/lib/domain/project-operations-read-model";
import type { ConversationDto, MessageDto } from "@/lib/domain/conversation-authority";

const id = (n: number) => `${String(n).padStart(8,"0")}-0000-4000-8000-000000000000`;
const facts: MvpProjectFact[] = [{ key: "city", value: "Hamburg" }, { key: "building_type", value: "single_family_house" }, { key: "installation_address", value: "Testweg 1" }];

describe("Project Inbox Read Model", () => {
  const base = { title: "Neue Klimaanfrage", status: "new" as const, city: "Hamburg", postal_code: "22000", created_at: "2026-09-14T08:00:00Z", updated_at: "2026-09-14T09:00:00Z", facts };
  it("mappt bekannte und bewusst unbekannte Kundennamen sowie Kontext und Lücken", () => {
    expect(customerDisplayName({ first_name: "Anna", last_name: "Beispiel" })).toBe("Anna Beispiel");
    expect(customerDisplayName({ first_name: null, last_name: null })).toBe(UNKNOWN_CUSTOMER_NAME);
    const [item] = mapProjectInbox([{ ...base, id: id(1), customer: null, requires_human_review: true }]);
    expect(item).toMatchObject({ customerName: UNKNOWN_CUSTOMER_NAME, city: "Hamburg", requires_human_review: true });
    expect(item.qualification.missingFacts.length).toBeGreaterThan(0);
  });
  it("sucht, filtert und priorisiert Review vor letzter Aktivität", () => {
    const rows = mapProjectInbox([
      { ...base, id: id(1), customer: { first_name: "Anna", last_name: "Nord" }, requires_human_review: false, latest_activity_at: "2026-09-15T12:00:00Z" },
      { ...base, id: id(2), customer: null, requires_human_review: true, latest_activity_at: "2026-09-14T12:00:00Z" },
    ]);
    expect(rows.map((row) => row.id)).toEqual([id(2), id(1)]);
    expect(mapProjectInbox(rows, { query: "anna", status: "new", review: "false" }).map((row) => row.id)).toEqual([id(1)]);
  });
});

describe("Facts display", () => {
  it("deckt jeden kanonischen Key ab und zeigt sichere unbekannte/technische Werte", () => {
    expect(Object.keys(FACT_DISPLAY).sort()).toEqual([...MVP_PROJECT_FACT_KEYS].sort());
    expect(mapFactDisplay([])).toHaveLength(MVP_PROJECT_FACT_KEYS.length);
    expect(mapFactDisplay([]).every((item) => item.value === "Noch nicht bekannt")).toBe(true);
    expect(displayFactValue({ key: "electrical_supply", value: "requires_site_check" })).toBe("Vor-Ort-Prüfung erforderlich");
    expect(mapFactDisplay(facts).every((item) => !item.value.startsWith("{") && !item.value.startsWith("["))).toBe(true);
  });
});

describe("Conversation Read Model", () => {
  const conversation = (n: number, status: ConversationDto["status"], created_at: string): ConversationDto => ({ conversation_id: id(n), customer_id: null, project_id: id(9), status, revision: 1, created_at, updated_at: created_at });
  const message = (n: number, conversation_id: string, sequence: number, direction: MessageDto["direction"], content: MessageDto["content"]): MessageDto => ({ message_id: id(n), conversation_id, sequence, direction, kind: content.type === "text" ? "text" : "image_reference", actor_class: direction === "inbound" ? "customer" : "ai", content, occurred_at: "2026-09-15T10:00:00Z", created_at: "2026-09-15T10:00:00Z", reply_to_message_id: null });
  it("trennt Historie, sortiert Sequenzen und mappt Richtung, Text und Bild sicher", () => {
    const old = conversation(1, "closed", "2026-09-13T10:00:00Z"), current = conversation(2, "open", "2026-09-14T10:00:00Z");
    const messages = [message(5, current.conversation_id, 2, "outbound", { type: "text", text: "Hallo" }), message(4, current.conversation_id, 1, "inbound", { type: "reference", reference_id: id(8) })];
    const result = mapConversationWorkspace([old, current], messages, new Map([[id(4), "signed:image"]]));
    expect(result.map((item) => item.historical)).toEqual([false, true]);
    expect(result[0].messages.map((item) => [item.sequence, item.speaker, item.mediaUrl])).toEqual([[1, "Kunde", "signed:image"], [2, "KlimaGuy", null]]);
    expect(result[1].messages).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/transport|provider|phone/);
  });
});
