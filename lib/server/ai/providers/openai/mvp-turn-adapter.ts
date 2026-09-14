import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { mvpAiTurnResultSchema, type MvpAiTurnInput } from "@/lib/domain/mvp-ai-turn";
import type { MvpAiTurnProvider } from "../../mvp-turn-provider";
import { readOpenAiEnvironment, readOpenAiProviderConfig, type OpenAiEnvironment } from "./config";
import { OPENAI_MVP_TURN_INSTRUCTIONS } from "./mvp-turn-instructions";
import { mvpOpenAiTurnOutputSchema } from "./mvp-turn-output-schema";

type MvpOpenAiClient = Pick<OpenAI, "responses">;

export class MvpOpenAiTurnError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "MvpOpenAiTurnError"; }
}

/** Dedicated natural-language adapter. It shares bootstrap config, not legacy prompt semantics. */
export class OpenAiMvpTurnProvider implements MvpAiTurnProvider {
  private client?: MvpOpenAiClient;
  constructor(
    private readonly environment: () => OpenAiEnvironment = readOpenAiEnvironment,
    private readonly clientFactory: (apiKey: string, timeout: number) => MvpOpenAiClient =
      (apiKey, timeout) => new OpenAI({ apiKey, timeout, maxRetries: 0 }),
  ) {}

  async generateTurn(input: MvpAiTurnInput): Promise<unknown> {
    const configured = readOpenAiProviderConfig(this.environment());
    if (!configured.success) throw new MvpOpenAiTurnError("mvp_openai_configuration_failed");
    this.client ??= this.clientFactory(configured.config.apiKey, configured.config.timeoutMs);
    try {
      const response = await this.client.responses.parse({
        model: configured.config.model,
        instructions: OPENAI_MVP_TURN_INSTRUCTIONS,
        input: [{ role: "user", content: [
          { type: "input_text", text: JSON.stringify({ ...input, ready_media: input.ready_media.map(({ image_data: _imageData, ...media }) => media) }) },
          ...input.ready_media.map((media) => ({ type: "input_image" as const, image_url: media.image_data, detail: "auto" as const })),
        ] }],
        text: { format: zodTextFormat(mvpOpenAiTurnOutputSchema, "klimaguy_mvp_turn") },
      });
      if (response.status !== undefined && response.status !== "completed") throw new Error("incomplete");
      return mvpAiTurnResultSchema.parse(response.output_parsed);
    } catch (error) {
      throw new MvpOpenAiTurnError("mvp_openai_turn_failed", { cause: error });
    }
  }
}
