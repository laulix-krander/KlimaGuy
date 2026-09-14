import { describe, expect, it, vi } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { OpenAiMvpTurnProvider } from "../lib/server/ai/providers/openai/mvp-turn-adapter";
import { mvpAiTurnInputSchema, mvpAiTurnResultSchema } from "../lib/domain/mvp-ai-turn";
import {
  mvpOpenAiFactSchema,
  mvpOpenAiTurnOutputSchema,
} from "../lib/server/ai/providers/openai/mvp-turn-output-schema";
import { MVP_BUILDING_TYPES } from "../lib/domain/mvp-project-facts";

function containsEmptySchema(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsEmptySchema);
  if (value === null || typeof value !== "object") return false;
  const entries = Object.entries(value);
  return entries.length === 0 || entries.some(([, child]) => containsEmptySchema(child));
}

describe("dedicated MVP OpenAI provider", () => {
  it("makes exactly one stateless structured Responses call", async () => {
    const output = { reply_text: "Welche Etage ist es?", facts_patch: [], missing_facts: ["floor_level"], qualification_status: "in_progress", needs_human: false, human_reason: null };
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: output });
    const provider = new OpenAiMvpTurnProvider(() => ({ OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-4.1-mini" }), () => ({ responses: { parse } } as never));
    const input = mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [{ message_id: "00000000-0000-4000-8000-000000000001", sequence: 1, direction: "inbound", text: "Hallo" }], ready_media: [] });
    await expect(provider.generateTurn(input)).resolves.toEqual(output); expect(parse).toHaveBeenCalledOnce();
    const request = parse.mock.calls[0][0]; expect(request).not.toHaveProperty("previous_response_id"); expect(request).not.toHaveProperty("conversation");
    expect(request.input[0].content).toHaveLength(1);
  });

  it("uses a strict provider schema without unconstrained schema nodes", async () => {
    const output = { reply_text: "Danke.", facts_patch: [], missing_facts: [], qualification_status: "ready_for_offer", needs_human: false, human_reason: null };
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: output });
    const provider = new OpenAiMvpTurnProvider(() => ({ OPENAI_API_KEY: "test" }), () => ({ responses: { parse } } as never));

    await provider.generateTurn(mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [], ready_media: [] }));

    const format = zodTextFormat(mvpOpenAiTurnOutputSchema, "klimaguy_mvp_turn");
    expect(format.strict).toBe(true);
    expect(containsEmptySchema(format.schema)).toBe(false);
    expect(parse.mock.calls[0][0].text.format).toEqual(format);

    const generatedSchema = format.schema as {
      properties: { facts_patch: { items: { anyOf: Array<{
        properties?: { key?: { const?: string }; value?: { enum?: readonly string[] } };
      }> } } };
    };
    const factBranches = generatedSchema.properties.facts_patch.items.anyOf;
    const buildingType = factBranches.find((branch) =>
      branch.properties?.key?.const === "building_type");
    expect(buildingType?.properties?.value?.enum).toEqual(MVP_BUILDING_TYPES);
    expect(factBranches).toHaveLength(21);
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
      expect(mvpOpenAiFactSchema.safeParse(representative).success).toBe(true);
    }
  });

  it("returns provider-safe output without applying authoritative domain validation", async () => {
    const output = { reply_text: "Danke.", facts_patch: [{ key: "floor_level", value: 1.5 }], missing_facts: [], qualification_status: "in_progress", needs_human: false, human_reason: null };
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: output });
    const provider = new OpenAiMvpTurnProvider(() => ({ OPENAI_API_KEY: "test" }), () => ({ responses: { parse } } as never));

    await expect(provider.generateTurn(mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "In einem Einfamilienhaus" }, transcript: [], ready_media: [] }))).resolves.toEqual(output);
    expect(mvpAiTurnResultSchema.safeParse(output).success).toBe(false);
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
      ],
      missing_facts: [], qualification_status: "in_progress", needs_human: false, human_reason: null,
    };

    expect(mvpAiTurnResultSchema.parse(result)).toEqual(result);
    expect(() => mvpAiTurnResultSchema.parse({ ...result, facts_patch: [{ key: "floor_level", value: "zweiter Stock" }] })).toThrow();
  });

  it("keeps missing configuration classified without making a provider call", async () => {
    const clientFactory = vi.fn();
    const provider = new OpenAiMvpTurnProvider(() => ({}), clientFactory);
    const input = mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [], ready_media: [] });

    await expect(provider.generateTurn(input)).rejects.toThrow("mvp_openai_configuration_failed");
    expect(clientFactory).not.toHaveBeenCalled();
  });
});
