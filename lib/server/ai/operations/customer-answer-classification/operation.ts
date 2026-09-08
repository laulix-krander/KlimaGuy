import { getAnswerInterpretationRule } from "@/lib/domain/conversation-intelligence/answer-interpretation-registry";
import type { StructuredInferenceFailure, } from "../../errors";
import type { StructuredInferenceProvider } from "../../contracts";
import { structuredInferenceRequestSchema, structuredInferenceResultSchema } from "../../schemas";
import { CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS } from "./instructions";
import { customerAnswerClassificationInputV1Schema, customerAnswerClassificationProposalV1Schema, customerAnswerClassificationProviderInputV1Schema, type CustomerAnswerClassificationInputV1, type CustomerAnswerClassificationProposalV1 } from "./schemas";

export type InterpretCustomerAnswerResult = Readonly<{ success: true; source: "deterministic" | "inference"; proposal: CustomerAnswerClassificationProposalV1 }> | Readonly<{ success: false; failure: StructuredInferenceFailure }>;

const invalidOutput = (attempt: number): StructuredInferenceFailure => ({ success: false, state: "failed", failureClass: "invalid_structured_output", retryable: false, diagnostics: { latencyMs: 0, attempt, schemaValidation: "invalid" } });
const normalizeRegistryText = (value: string) => value.trim().toLocaleLowerCase("de-DE").replace(/[.!?]+$/u, "").trim();

export async function interpretCustomerAnswer(input: CustomerAnswerClassificationInputV1, provider: StructuredInferenceProvider): Promise<InterpretCustomerAnswerResult> {
  const parsed = customerAnswerClassificationInputV1Schema.safeParse(input);
  if (!parsed.success) return { success: false, failure: invalidOutput(1) };
  const value = parsed.data;
  const rule = getAnswerInterpretationRule(value.question.informationKey);
  const registered = rule?.canonical_values;
  if (!rule || rule.status !== "active" || rule.supported_normalized_kind !== "text" || rule.semantic_mode !== value.question.semanticMode || !registered) return { success: false, failure: invalidOutput(value.correlation.attempt) };
  const registeredValues = new Set(Object.values(registered));
  if (value.allowedValues.some(({ key }) => !registeredValues.has(key))) return { success: false, failure: invalidOutput(value.correlation.attempt) };
  const allowlist = new Set(value.allowedValues.map(({ key }) => key));
  const exact = registered[normalizeRegistryText(value.answer.text)];
  if (exact && allowlist.has(exact)) return { success: true, source: "deterministic", proposal: { schemaVersion: 1, result: "matched", canonicalValue: exact } };

  const providerInput = customerAnswerClassificationProviderInputV1Schema.parse({ schemaVersion: 1, informationKey: value.question.informationKey, semanticMode: value.question.semanticMode, answer: value.answer, allowedValues: value.allowedValues });
  const request = structuredInferenceRequestSchema.parse({ operationKey: CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.operationKey, operationVersion: 1, inputSchemaVersion: 1, outputSchemaVersion: 1, locale: value.locale, correlation: { correlationId: value.correlation.correlationId, attempt: value.correlation.attempt }, instructions: { templateKey: CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS.instructionTemplateKey, version: 1 }, input: providerInput });
  const transport = structuredInferenceResultSchema.safeParse(await provider.generateStructuredInference(request));
  if (!transport.success) return { success: false, failure: invalidOutput(value.correlation.attempt) };
  if (!transport.data.success) return { success: false, failure: transport.data };
  const proposal = customerAnswerClassificationProposalV1Schema.safeParse(transport.data.output);
  if (!proposal.success || (proposal.data.result === "matched" && !allowlist.has(proposal.data.canonicalValue))) return { success: false, failure: invalidOutput(value.correlation.attempt) };
  return { success: true, source: "inference", proposal: proposal.data };
}
