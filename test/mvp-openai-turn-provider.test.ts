import { describe, expect, it, vi } from "vitest";
import { OpenAiMvpTurnProvider } from "../lib/server/ai/providers/openai/mvp-turn-adapter";
import { mvpAiTurnInputSchema } from "../lib/domain/mvp-ai-turn";

describe("dedicated MVP OpenAI provider", () => {
  it("makes exactly one stateless structured Responses call", async () => {
    const output = { reply_text: "Welche Etage ist es?", facts_patch: [], missing_facts: ["floor_level"], qualification_status: "in_progress", needs_human: false, human_reason: null };
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: output });
    const provider = new OpenAiMvpTurnProvider(() => ({ OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-4.1-mini" }), () => ({ responses: { parse } } as never));
    const input = mvpAiTurnInputSchema.parse({ turn: { inbound_message_id: "00000000-0000-4000-8000-000000000001", conversation_id: "00000000-0000-4000-8000-000000000002", expected_conversation_revision: 1, binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 1, project_id: "00000000-0000-4000-8000-000000000004" }, project: { title: "Anfrage" }, persisted_facts: [], inbound: { message_id: "00000000-0000-4000-8000-000000000001", text: "Hallo" }, transcript: [{ message_id: "00000000-0000-4000-8000-000000000001", sequence: 1, direction: "inbound", text: "Hallo" }], ready_media: [] });
    await expect(provider.generateTurn(input)).resolves.toEqual(output); expect(parse).toHaveBeenCalledOnce();
    const request = parse.mock.calls[0][0]; expect(request).not.toHaveProperty("previous_response_id"); expect(request).not.toHaveProperty("conversation");
  });
});
