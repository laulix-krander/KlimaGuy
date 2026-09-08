import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { StructuredInferenceProvider, StructuredInferenceRequest, StructuredInferenceResult } from "../../contracts";
import { AI_INFERENCE_RETRYABLE } from "../../errors";
import { structuredInferenceRequestSchema } from "../../schemas";
import { customerAnswerClassificationProviderInputV1Schema, customerAnswerClassificationProposalV1Schema } from "../../operations/customer-answer-classification/schemas";
import { CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS } from "../../operations/customer-answer-classification/instructions";
import { readOpenAiEnvironment, readOpenAiProviderConfig, type OpenAiEnvironment, type OpenAiProviderConfig } from "./config";
import { mapOpenAiError } from "./error-mapper";
import { OPENAI_CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS_V1 } from "./instructions";

const openAiClassificationOutputSchema = z.object({
  schemaVersion: z.literal(1),
  result: z.enum(["matched", "no_match", "ambiguous"]),
  canonicalValue: z.string().trim().min(1).max(100).nullable(),
}).strict();

type OpenAiClassificationOutput = z.infer<typeof openAiClassificationOutputSchema>;
type OpenAiParsedResponse = Readonly<{
  status?: string;
  output_parsed?: unknown;
  output?: ReadonlyArray<Readonly<{ content?: ReadonlyArray<Readonly<{ type?: string }>> }>>;
}>;
type OpenAiParseRequest = Readonly<Record<string, unknown>>;
type OpenAiClientBoundary = Readonly<{ responses: Readonly<{ parse(request: OpenAiParseRequest): Promise<OpenAiParsedResponse> }> }>;

export type OpenAiStructuredInferenceProviderOptions = Readonly<{
  environment?: OpenAiEnvironment;
  clientFactory?: (config: OpenAiProviderConfig) => OpenAiClientBoundary;
  now?: () => number;
}>;

const failure = (failureClass: ReturnType<typeof mapOpenAiError>, attempt: number, latencyMs: number, schemaValidation: "not_run" | "invalid"): StructuredInferenceResult => ({
  success: false,
  state: "failed",
  failureClass,
  retryable: AI_INFERENCE_RETRYABLE[failureClass],
  diagnostics: { latencyMs, attempt, schemaValidation },
});

const hasRefusal = (response: OpenAiParsedResponse): boolean =>
  response.output?.some((item) => item.content?.some((content) => content.type === "refusal")) ?? false;

function toNeutralProposal(output: OpenAiClassificationOutput): unknown {
  if (output.result === "matched") {
    return output.canonicalValue === null
      ? undefined
      : { schemaVersion: output.schemaVersion, result: output.result, canonicalValue: output.canonicalValue };
  }
  return output.canonicalValue === null
    ? { schemaVersion: output.schemaVersion, result: output.result }
    : undefined;
}

export class OpenAiStructuredInferenceProvider implements StructuredInferenceProvider {
  private readonly environment: OpenAiEnvironment;
  private readonly clientFactory: (config: OpenAiProviderConfig) => OpenAiClientBoundary;
  private readonly now: () => number;
  private client: OpenAiClientBoundary | undefined;

  constructor(options: OpenAiStructuredInferenceProviderOptions = {}) {
    this.environment = options.environment ?? readOpenAiEnvironment();
    this.now = options.now ?? Date.now;
    this.clientFactory = options.clientFactory ?? ((config) => {
      const client = new OpenAI({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 0 });
      return {
        responses: {
          parse: async (providerRequest) => client.responses.parse(
            providerRequest as Parameters<typeof client.responses.parse>[0],
          ) as Promise<OpenAiParsedResponse>,
        },
      };
    });
  }

  async generateStructuredInference(untrustedRequest: StructuredInferenceRequest): Promise<StructuredInferenceResult> {
    const startedAt = this.now();
    const request = structuredInferenceRequestSchema.safeParse(untrustedRequest);
    const attempt = request.success ? request.data.correlation.attempt : 1;
    const elapsed = () => Math.max(0, this.now() - startedAt);
    if (!request.success) return failure("invalid_structured_output", attempt, elapsed(), "invalid");

    const configResult = readOpenAiProviderConfig(this.environment);
    if (!configResult.success) return failure("configuration_failure", attempt, elapsed(), "not_run");
    const { config } = configResult;

    if (
      request.data.operationKey !== CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.operationKey
      || request.data.operationVersion !== CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.operationVersion
      || request.data.inputSchemaVersion !== CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.inputSchemaVersion
      || request.data.outputSchemaVersion !== CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.outputSchemaVersion
      || request.data.instructions.templateKey !== CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.instructionTemplateKey
      || request.data.instructions.version !== CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.instructionTemplateVersion
    ) return failure("unsupported", attempt, elapsed(), "not_run");

    const providerInput = customerAnswerClassificationProviderInputV1Schema.safeParse(request.data.input);
    if (!providerInput.success) return failure("invalid_structured_output", attempt, elapsed(), "invalid");

    try {
      this.client ??= this.clientFactory(config);
      const response = await this.client.responses.parse({
        model: config.model,
        instructions: OPENAI_CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS_V1,
        input: JSON.stringify({ locale: request.data.locale, ...providerInput.data }),
        text: { format: zodTextFormat(openAiClassificationOutputSchema, "customer_answer_canonical_classification_v1") },
      });

      if (hasRefusal(response)) return failure("refused", attempt, elapsed(), "not_run");
      if (response.status !== undefined && response.status !== "completed") return failure("invalid_structured_output", attempt, elapsed(), "invalid");
      const parsedOutput = openAiClassificationOutputSchema.safeParse(response.output_parsed);
      if (!parsedOutput.success) return failure("invalid_structured_output", attempt, elapsed(), "invalid");
      const neutralOutput = toNeutralProposal(parsedOutput.data);
      const domainValidatedOutput = customerAnswerClassificationProposalV1Schema.safeParse(neutralOutput);
      if (!domainValidatedOutput.success) return failure("invalid_structured_output", attempt, elapsed(), "invalid");

      return {
        success: true,
        state: "completed",
        output: domainValidatedOutput.data,
        diagnostics: { latencyMs: elapsed(), attempt },
      };
    } catch (error) {
      return failure(mapOpenAiError(error), attempt, elapsed(), "not_run");
    }
  }
}
