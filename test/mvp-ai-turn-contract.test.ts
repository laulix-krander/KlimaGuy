import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mvpAiTurnInputSchema, mvpAiTurnResultSchema } from "../lib/domain/mvp-ai-turn";
import {
  MVP_PROJECT_FACT_KEYS,
  mvpProjectFactSchema,
  type MvpProjectFact,
} from "../lib/domain/mvp-project-facts";

const ids = {
  message: "00000000-0000-4000-8000-000000000001",
  conversation: "00000000-0000-4000-8000-000000000002",
  binding: "00000000-0000-4000-8000-000000000003",
  project: "00000000-0000-4000-8000-000000000004",
  media: "00000000-0000-4000-8000-000000000005",
} as const;

const allValidFacts: MvpProjectFact[] = [
  { key: "installation_address", value: "Musterstraße 1" },
  { key: "postal_code", value: "12345" },
  { key: "city", value: "Berlin" },
  { key: "building_type", value: "apartment" },
  { key: "floor_level", value: 3 },
  { key: "requested_room_count", value: 2 },
  { key: "room_type", value: "living_room" },
  { key: "room_area_sqm", value: 28.5 },
  { key: "indoor_unit_count", value: 2 },
  { key: "indoor_unit_position", value: "Über der Wohnzimmertür" },
  { key: "outdoor_unit_position", value: "Auf dem Balkon" },
  { key: "line_route", value: "Entlang der Außenwand" },
  { key: "estimated_line_length_m", value: 8.5 },
  { key: "core_drilling_count", value: 2 },
  { key: "condensate_drainage", value: "available" },
  { key: "electrical_supply", value: "requires_site_check" },
  { key: "installation_access", value: "standard_ladder" },
  { key: "existing_air_conditioning", value: false },
  { key: "customer_preferences", value: "Möglichst leises Innengerät" },
  { key: "required_photo_categories", value: ["room_overview", "outdoor_unit_location"] },
  { key: "additional_installation_notes", value: "Außenwand steht unter Denkmalschutz." },
];

const validResult = {
  reply_text: "Danke! Wo könnte das Außengerät ungefähr montiert werden?",
  facts_patch: [
    { key: "room_area_sqm", value: 28.5 },
    { key: "existing_air_conditioning", value: false },
  ],
  qualification_status: "in_progress",
  needs_human: false,
  human_reason: null,
  customer_name_patch: null,
  media_classifications: [],
  learning_candidates: [],
} as const;

describe("MVP project fact registry", () => {
  it("accepts every canonical fact with its registered value type", () => {
    expect(allValidFacts.map((fact) => mvpProjectFactSchema.parse(fact))).toEqual(allValidFacts);
    expect(allValidFacts.map(({ key }) => key)).toEqual(MVP_PROJECT_FACT_KEYS);
  });

  it("rejects unknown keys, invalid value types and invalid enum values", () => {
    expect(mvpProjectFactSchema.safeParse({ key: "offer_price", value: 7_500 }).success).toBe(false);
    expect(mvpProjectFactSchema.safeParse({ key: "room_area_sqm", value: "28.5" }).success).toBe(false);
    expect(mvpProjectFactSchema.safeParse({ key: "building_type", value: "warehouse" }).success).toBe(false);
  });
});

describe("MVP AI turn result", () => {
  it("parses a valid result with multiple typed fact patches", () => {
    expect(mvpAiTurnResultSchema.parse(validResult)).toEqual(validResult);
  });

  it("accepts full and partial name patches but rejects empty or arbitrary Customer mutations", () => {
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, customer_name_patch: { first_name: "Max", last_name: "Mustermann" } }).success).toBe(true);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, customer_name_patch: { first_name: "Max", last_name: null } }).success).toBe(true);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, customer_name_patch: { first_name: null, last_name: null } }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, customer_name_patch: { first_name: "Max", last_name: null, phone: "+49123" } }).success).toBe(false);
  });

  it("rejects redundant provider missing facts and non-canonical qualification states", () => {
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, missing_facts: ["line_route"] }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, qualification_status: "approved" }).success).toBe(false);
  });

  it("requires a strict boolean human flag and maintains escalation invariants", () => {
    const { needs_human: _omitted, ...withoutFlag } = validResult;
    expect(mvpAiTurnResultSchema.safeParse(withoutFlag).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, needs_human: "false" }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, qualification_status: "needs_human", needs_human: true, human_reason: "safety_concern" }).success).toBe(true);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, qualification_status: "needs_human", needs_human: false }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, human_reason: "safety_concern" }).success).toBe(false);
  });

  it("accepts normal and escalated results but rejects mismatched escalation fields", () => {
    expect(mvpAiTurnResultSchema.safeParse(validResult).success).toBe(true);
    expect(mvpAiTurnResultSchema.safeParse({
      ...validResult,
      qualification_status: "needs_human",
      needs_human: true,
      human_reason: "requires_site_check",
    }).success).toBe(true);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, needs_human: true }).success).toBe(false);
  });

  it("accepts a structurally normal ready result but rejects pricing or offer authority fields", () => {
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, qualification_status: "ready_for_offer" }).success).toBe(true);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, price_cents: 750_000 }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, offer_approved: true }).success).toBe(false);
  });

  it("rejects empty replies, source spoofing and malformed provider-style objects", () => {
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, reply_text: "   " }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ ...validResult, facts_patch: [{ key: "city", value: "Berlin", source_message_id: ids.message }] }).success).toBe(false);
    expect(mvpAiTurnResultSchema.safeParse({ output: [{ type: "message", content: validResult }] }).success).toBe(false);
  });
});

describe("MVP AI turn input", () => {
  const validInput = {
    turn: {
      inbound_message_id: ids.message,
      conversation_id: ids.conversation,
      expected_conversation_revision: 4,
      binding_id: ids.binding,
      binding_revision: 2,
      project_id: ids.project,
    },
    project: { title: "Neue Klimaanfrage", status: "collecting_information", requires_human_review: false },
    customer: { name_known: false, first_name: null, last_name: null },
    persisted_facts: [{ key: "city", value: "Berlin" }],
    inbound: { message_id: ids.message, text: "Das Wohnzimmer ist etwa 28 m² groß." },
    transcript: [{ message_id: ids.message, sequence: 1, direction: "inbound", text: "Das Wohnzimmer ist etwa 28 m² groß." }],
    ready_media: [{ media_id: ids.media, category: "room_overview", mime_type: "image/jpeg", caption: null,
      image_data: "data:image/jpeg;base64,/9j/" }],
    project_photo_coverage: [],
    knowledge_context: [],
  qualification_context: { collection_active: true, missing_facts: ["installation_address"], missing_photos: ["room_overview"], requires_site_check: false },
  } as const;

  it("receives only current turn, project, facts, inbound content, transcript and ready media metadata", () => {
    expect(mvpAiTurnInputSchema.parse(validInput)).toEqual(validInput);
  });

  it("treats a partial name as known and rejects transport PII", () => {
    expect(mvpAiTurnInputSchema.safeParse({ ...validInput, customer: { name_known: true, first_name: "Max", last_name: null } }).success).toBe(true);
    expect(mvpAiTurnInputSchema.safeParse({ ...validInput, customer: { name_known: false, first_name: "Max", last_name: null } }).success).toBe(false);
    expect(mvpAiTurnInputSchema.safeParse({ ...validInput, customer: { ...validInput.customer, phone: "+49123" } }).success).toBe(false);
  });

  it("does not represent unrelated or old Conversation data", () => {
    expect(mvpAiTurnInputSchema.safeParse({ ...validInput, previous_conversations: [{ conversation_id: ids.conversation }] }).success).toBe(false);
    expect(mvpAiTurnInputSchema.safeParse({ ...validInput, customer_history: [] }).success).toBe(false);
  });

  it("contains no provider-memory or OpenAI-specific contract dependency", () => {
    const sources = [
      readFileSync("lib/domain/mvp-ai-turn.ts", "utf8"),
      readFileSync("lib/domain/mvp-project-facts.ts", "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/from ["']openai["']|previous_response_id|assistant_id|thread_id/u);
  });
});
