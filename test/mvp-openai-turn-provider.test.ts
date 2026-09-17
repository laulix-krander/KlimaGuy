import { describe, expect, it, vi } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { OpenAiMvpTurnProvider } from "../lib/server/ai/providers/openai/mvp-turn-adapter";
import { mvpAiTurnInputSchema, mvpAiTurnResultSchema } from "../lib/domain/mvp-ai-turn";
import {
  mvpOpenAiFactSchema,
  mvpOpenAiTurnOutputSchema,
} from "../lib/server/ai/providers/openai/mvp-turn-output-schema";
import {
  MVP_BUILDING_TYPES,
  MVP_REQUIRED_PHOTO_CATEGORIES,
} from "../lib/domain/mvp-project-facts";
import {
  MVP_HUMAN_ESCALATION_REASONS,
  MVP_QUALIFICATION_STATUSES,
} from "../lib/domain/mvp-ai-turn";
import { OPENAI_MVP_TURN_INSTRUCTIONS } from "../lib/server/ai/providers/openai/mvp-turn-instructions";

function containsEmptySchema(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsEmptySchema);
  if (value === null || typeof value !== "object") return false;
  const entries = Object.entries(value);
  return entries.length === 0 || entries.some(([, child]) => containsEmptySchema(child));
}

function resolveSchemaReference(root: Record<string, unknown>, schema: Record<string, unknown> | undefined) {
  if (typeof schema?.$ref !== "string" || !schema.$ref.startsWith("#/")) return schema;
  return schema.$ref.slice(2).split("/").reduce<unknown>((value, segment) =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>)[segment] : undefined, root);
}

describe("dedicated MVP OpenAI provider", () => {
  it("makes exactly one stateless structured Responses call", async () => {
    const output = { reply_text: "Welche Etage ist es?", facts_patch: [], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [] };
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: output });
    const provider = new OpenAiMvpTurnProvider(() => ({ OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-4.1-mini" }), () => ({ responses: { parse } } as never));
    const input = mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, customer: { name_known: false, first_name: null, last_name: null }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [{ message_id: "00000000-0000-4000-8000-000000000001", sequence: 1, direction: "inbound", text: "Hallo" }], ready_media: [], qualification_context: { missing_facts: ["installation_address"], missing_photos: ["room_overview"], requires_site_check: false } });
    await expect(provider.generateTurn(input)).resolves.toEqual(output); expect(parse).toHaveBeenCalledOnce();
    const request = parse.mock.calls[0][0]; expect(request).not.toHaveProperty("previous_response_id"); expect(request).not.toHaveProperty("conversation");
    expect(request.input[0].content).toHaveLength(1);
  });

  it("uses a strict provider schema without unconstrained schema nodes", async () => {
    const output = { reply_text: "Danke.", facts_patch: [], qualification_status: "ready_for_offer", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [] };
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: output });
    const provider = new OpenAiMvpTurnProvider(() => ({ OPENAI_API_KEY: "test" }), () => ({ responses: { parse } } as never));

    await provider.generateTurn(mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, customer: { name_known: false, first_name: null, last_name: null }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [], ready_media: [], qualification_context: { missing_facts: ["installation_address"], missing_photos: ["room_overview"], requires_site_check: false } }));

    const format = zodTextFormat(mvpOpenAiTurnOutputSchema, "klimaguy_mvp_turn");
    expect(format.strict).toBe(true);
    expect(containsEmptySchema(format.schema)).toBe(false);
    expect(parse.mock.calls[0][0].text.format).toEqual(format);

    const generatedSchema = format.schema as {
      type: string;
      anyOf?: unknown;
      oneOf?: unknown;
      properties: {
        facts_patch: { items: { anyOf: Array<{
        properties?: { key?: { const?: string }; value?: Record<string, unknown> };
        }> } };
        customer_name_patch: { anyOf: Array<{ anyOf?: Array<Record<string, unknown>>; type?: string }> };
        qualification_status: { enum: string[] };
        human_reason: { anyOf: Array<{ enum?: string[]; type?: string }> };
      };
    };
    expect(generatedSchema.type).toBe("object");
    expect(generatedSchema).not.toHaveProperty("anyOf");
    expect(generatedSchema).not.toHaveProperty("oneOf");

    const factBranches = generatedSchema.properties.facts_patch.items.anyOf;
    const buildingType = factBranches.find((branch) =>
      branch.properties?.key?.const === "building_type");
    expect(buildingType?.properties?.value?.enum).toEqual(MVP_BUILDING_TYPES);
    expect(factBranches).toHaveLength(20);
    const valueSchema = (key: string) => resolveSchemaReference(
      format.schema as Record<string, unknown>,
      factBranches.find((branch) => branch.properties?.key?.const === key)?.properties?.value,
    );
    expect(valueSchema("line_route")).toMatchObject({ type: "string", minLength: 1, maxLength: 240 });
    expect(valueSchema("postal_code")).toMatchObject({ type: "string", pattern: "^\\d{5}$" });
    expect(valueSchema("floor_level")).toMatchObject({ type: "integer", minimum: -2, maximum: 100 });
    expect(valueSchema("requested_room_count")).toMatchObject({ type: "integer", minimum: 1, maximum: 20 });
    expect(valueSchema("room_area_sqm")).toMatchObject({ type: "number", minimum: 5, maximum: 500 });
    expect(factBranches.some((branch) => branch.properties?.key?.const === "required_photo_categories")).toBe(false);
    const customerNameBranches = generatedSchema.properties.customer_name_patch.anyOf;
    expect(customerNameBranches).toHaveLength(2);
    expect(customerNameBranches[0]?.anyOf).toHaveLength(2);
    expect(customerNameBranches[1]).toMatchObject({ type: "null" });
    expect(generatedSchema.properties.qualification_status.enum).toEqual(MVP_QUALIFICATION_STATUSES);
    expect(generatedSchema.properties.human_reason.anyOf).toContainEqual({
      type: "string",
      enum: MVP_HUMAN_ESCALATION_REASONS,
    });
  });

  it("encodes canonical values per fact key, including the Production building-type case", () => {
    expect(mvpOpenAiFactSchema.safeParse({ key: "building_type", value: "single_family_house" }).success).toBe(true);
    expect(mvpOpenAiFactSchema.safeParse({ key: "building_type", value: "Einfamilienhaus" }).success).toBe(false);
    expect(mvpOpenAiFactSchema.safeParse({ key: "building_type", value: 1 }).success).toBe(false);

    for (const representative of [
      { key: "installation_address", value: "Musterstraße 1" },
      { key: "floor_level", value: 2 },
      { key: "existing_air_conditioning", value: false },
      { key: "room_type", value: "living_room" },
      { key: "required_photo_categories", value: ["room_overview", "pipe_route"] },
    ]) {
      expect(mvpOpenAiFactSchema.safeParse(representative).success).toBe(representative.key !== "required_photo_categories");
    }
  });

  it.each([
    { key: "line_route", value: "" },
    { key: "floor_level", value: 1.5 },
    { key: "requested_room_count", value: 0 },
    { key: "room_area_sqm", value: 501 },
    { key: "indoor_unit_count", value: 21 },
    { key: "estimated_line_length_m", value: 201 },
    { key: "core_drilling_count", value: -1 },
  ])("rejects a preventable canonical primitive mismatch for $key", (fact) => {
    expect(mvpOpenAiFactSchema.safeParse(fact).success).toBe(false);
  });

  it("represents an unresolved line route by omitting the fact patch", () => {
    const unresolved = { reply_text: "Gibt es einen Anschluss in der Nähe?", facts_patch: [], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [] };
    expect(mvpOpenAiTurnOutputSchema.safeParse(unresolved).success).toBe(true);
    expect(unresolved.facts_patch).not.toContainEqual(expect.objectContaining({ key: "line_route" }));
    expect(mvpOpenAiFactSchema.safeParse({ key: "line_route", value: "Entlang der Außenwand" }).success).toBe(true);
  });

  it("structurally enforces safe name patches without encoding cross-field escalation rules", () => {
    const normal = { reply_text: "Danke.", facts_patch: [], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [] };
    expect(mvpOpenAiTurnOutputSchema.safeParse({ ...normal, customer_name_patch: { first_name: null, last_name: null } }).success).toBe(false);
    expect(mvpOpenAiTurnOutputSchema.safeParse({ ...normal, needs_human: true }).success).toBe(true);
    expect(mvpOpenAiTurnOutputSchema.safeParse({ ...normal, qualification_status: "needs_human", needs_human: true, human_reason: "safety_concern" }).success).toBe(true);
  });

  it("instructs the live-case unknown, uncertainty, and electrical boundaries", () => {
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("Nein noch nicht");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("keinen line_route-Fakt");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("gibt es nicht, glaub ich");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("nie zu einer definitiven technischen Tatsache");
    for (const phrase of ["Ich denke schon", "glaube ja", "wahrscheinlich", "weiß ich nicht genau", "niemals available", "condensate_drainage auf unknown"]) expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain(phrase);
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("Anwesenheit eines Anschlusses/einer Zuleitung");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("nie danach, ob diese technisch geeignet oder ausreichend ist");
  });

  it("instructs same-turn and persisted human handoff without fake completion", () => {
    for (const phrase of ["line_route nicht bestimmen kann", "keine weiteren angeforderten Fotos", "project.status human_review", "starte den normalen Lückenfragebogen", "freiwillig gelieferte neue Fakten"]) expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain(phrase);
  });

  it("requires one context-aware, reply-consistent classification for every current image", () => {
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("für JEDES Bild aus ready_media genau einen Eintrag");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("reply_text und media_classifications dürfen einander nicht widersprechen");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("indoor_unit_location");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("outdoor_unit_location");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("verwende other");
  });

  it("extracts explicit room cardinality without inferring indoor units", () => {
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("„ein Wohnzimmer“ bedeutet requested_room_count 1");
    expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain("nicht automatisch indoor_unit_count 1");
  });

  it("uses deterministic gaps to continue the production case instead of declaring completion", () => {
    for (const requiredInstruction of [
      "Ignoriere missing_facts niemals",
      "ein oder zwei natürlich zusammenpassende Angaben",
      "Beginne den gebündelten Kernfoto-Request normalerweise erst",
      "building_type, requested_room_count, room_type, room_area_sqm, indoor_unit_count",
      "behandle dieses Motiv bereits in derselben Antwort als erfüllt",
      "Planung ist komplett",
      "alles vollständig",
      "bereit für technische Prüfung",
      "Setze dann andernfalls in_progress und qualifiziere weiter",
    ]) expect(OPENAI_MVP_TURN_INSTRUCTIONS).toContain(requiredInstruction);
  });

  it("validates representative provider facts with the authoritative domain contract", () => {
    const result = {
      reply_text: "Danke, die Angaben sind erfasst.",
      facts_patch: [
        { key: "installation_address", value: "Musterstraße 1" },
        { key: "floor_level", value: 2 },
        { key: "existing_air_conditioning", value: false },
        { key: "building_type", value: "apartment" },
        { key: "required_photo_categories", value: ["room_overview", "pipe_route"] },
      ], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [],
    };

    expect(mvpAiTurnResultSchema.parse(result)).toEqual(result);
    expect(() => mvpAiTurnResultSchema.parse({ ...result, facts_patch: [{ key: "floor_level", value: "zweiter Stock" }] })).toThrow();
  });

  it("keeps missing configuration classified without making a provider call", async () => {
    const clientFactory = vi.fn();
    const provider = new OpenAiMvpTurnProvider(() => ({}), clientFactory);
    const input = mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, customer: { name_known: false, first_name: null, last_name: null }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [], ready_media: [], qualification_context: { missing_facts: ["installation_address"], missing_photos: ["room_overview"], requires_site_check: false } });

    await expect(provider.generateTurn(input)).rejects.toThrow("mvp_openai_configuration_failed");
    expect(clientFactory).not.toHaveBeenCalled();
  });
});
