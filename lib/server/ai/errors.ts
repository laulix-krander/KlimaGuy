import type { AiInferenceFailureClass, StructuredInferenceResult } from "./contracts";

export type StructuredInferenceFailure = Extract<StructuredInferenceResult, { success: false }>;

export const AI_INFERENCE_RETRYABLE: Readonly<Record<AiInferenceFailureClass, boolean>> = Object.freeze({
  transient_provider_failure: true,
  timeout: true,
  invalid_structured_output: false,
  refused: false,
  unsupported: false,
  configuration_failure: false,
  permanent_provider_failure: false,
});
