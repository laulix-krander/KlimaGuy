import { describe, expect, it } from "vitest";
import { structuredInferenceRequestSchema, structuredInferenceResultSchema } from "@/lib/server/ai/schemas";
import { customerAnswerClassificationProposalV1Schema } from "@/lib/server/ai/operations/customer-answer-classification/schemas";

describe("provider-neutraler Structured-Inference-Contract", () => {
  it.each([
    { schemaVersion: 1, result: "matched", canonicalValue: "apartment" },
    { schemaVersion: 1, result: "no_match" },
    { schemaVersion: 1, result: "ambiguous" },
  ])("akzeptiert den versionierten Proposal %#", (proposal) => {
    expect(customerAnswerClassificationProposalV1Schema.safeParse(proposal).success).toBe(true);
  });

  it.each([
    { schemaVersion: 2, result: "no_match" },
    { schemaVersion: 1, result: "matched" },
    { schemaVersion: 1, result: "no_match", canonicalValue: "invented" },
    { schemaVersion: 1, result: "matched", canonicalValue: "apartment", providerRequestId: "secret" },
  ])("weist invaliden oder provider-spezifischen Output ab %#", (proposal) => {
    expect(customerAnswerClassificationProposalV1Schema.safeParse(proposal).success).toBe(false);
  });

  it("begrenzt Requests auf neutrale, minimierte Felder", () => {
    const request = structuredInferenceRequestSchema.parse({
      operationKey: "customer_answer.canonical_classification", operationVersion: 1, inputSchemaVersion: 1, outputSchemaVersion: 1, locale: "de",
      correlation: { correlationId: "opaque", attempt: 1 }, instructions: { templateKey: "customer_answer_canonical_classification_de", version: 1 }, input: {},
    });
    expect(JSON.stringify(request)).not.toMatch(/phone|whatsapp|customerId|conversationId|projectId|transport|pricing|offer|media|model|token/i);
  });

  it("validiert alle neutralen Failure Classes", () => {
    for (const failureClass of ["transient_provider_failure", "timeout", "invalid_structured_output", "refused", "unsupported", "configuration_failure", "permanent_provider_failure"] as const) {
      expect(structuredInferenceResultSchema.safeParse({ success: false, state: "failed", failureClass, retryable: failureClass === "timeout" || failureClass === "transient_provider_failure", diagnostics: { latencyMs: 1, attempt: 1, schemaValidation: "not_run" } }).success).toBe(true);
    }
  });
});
