import type { z } from "zod";
import type { structuredInferenceRequestSchema, structuredInferenceResultSchema } from "./schemas";

export const AI_OPERATION_KEYS = ["customer_answer.canonical_classification"] as const;
export const AI_INFERENCE_FAILURE_CLASSES = ["transient_provider_failure", "timeout", "invalid_structured_output", "refused", "unsupported", "configuration_failure", "permanent_provider_failure"] as const;

export type AiOperationKey = typeof AI_OPERATION_KEYS[number];
export type AiInferenceFailureClass = typeof AI_INFERENCE_FAILURE_CLASSES[number];
export type StructuredInferenceRequest = z.infer<typeof structuredInferenceRequestSchema>;
export type StructuredInferenceResult = z.infer<typeof structuredInferenceResultSchema>;

export interface StructuredInferenceProvider {
  generateStructuredInference(request: StructuredInferenceRequest): Promise<StructuredInferenceResult>;
}
