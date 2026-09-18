import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { mvpVisionObservationSchema, type MvpAiTurnInput } from "@/lib/domain/mvp-ai-turn";
import { DEFAULT_KLIMAGUY_AGENT_SETTINGS, type KlimaGuyAgentSettings } from "@/lib/domain/klimaguy-agent-settings";
import type { MvpAiTurnProvider } from "../../mvp-turn-provider";
import { readOpenAiEnvironment, readOpenAiProviderConfig, type OpenAiEnvironment } from "./config";
import { buildOpenAiMvpTurnInstructions } from "./mvp-turn-instructions";
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
    private readonly settings: KlimaGuyAgentSettings = DEFAULT_KLIMAGUY_AGENT_SETTINGS,
  ) {}

  async generateTurn(input: MvpAiTurnInput): Promise<unknown> {
    const configured = readOpenAiProviderConfig(this.environment());
    if (!configured.success) throw new MvpOpenAiTurnError("mvp_openai_configuration_failed");
    this.client ??= this.clientFactory(configured.config.apiKey, configured.config.timeoutMs);
    try {
      const response = await this.client.responses.parse({
        model: configured.config.model,
        instructions: buildOpenAiMvpTurnInstructions(this.settings),
        input: [{ role: "user", content: [
          { type: "input_text", text: JSON.stringify({ ...input, ready_media: input.ready_media.map(({ image_data: _imageData, ...media }) => media) }) },
          ...input.ready_media.map((media) => ({ type: "input_image" as const, image_url: media.image_data, detail: "auto" as const })),
        ] }],
        text: { format: zodTextFormat(mvpOpenAiTurnOutputSchema, "klimaguy_mvp_turn") },
      });
      if (response.status !== undefined && response.status !== "completed") throw new Error("incomplete");
      const parsed = mvpOpenAiTurnOutputSchema.parse(response.output_parsed);
      return {
        reply_text: parsed.reply_text,
        facts_patch: parsed.facts_patch,
        customer_name_patch: parsed.customer_name_patch,
        media_classifications: parsed.media_classifications.map((classification) => ({
          ...classification,
          observation: classification.observation !== null
            && !mvpVisionObservationSchema.safeParse(classification.observation).success
            ? null
            : classification.observation,
        })),
        qualification_status: parsed.qualification.status,
        needs_human: parsed.qualification.status === "needs_human",
        human_reason: parsed.qualification.human_reason,
      };
    } catch (error) {
      throw new MvpOpenAiTurnError("mvp_openai_turn_failed", { cause: error });
    }
  }
}
