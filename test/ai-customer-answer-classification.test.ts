import { describe, expect, it } from "vitest";
import { interpretCustomerAnswer } from "@/lib/server/ai/operations/customer-answer-classification/operation";
import type { CustomerAnswerClassificationInputV1 } from "@/lib/server/ai/operations/customer-answer-classification/schemas";
import { FakeStructuredInferenceProvider } from "@/lib/server/ai/testing/fake-structured-inference-provider";
import type { AiInferenceFailureClass, StructuredInferenceResult } from "@/lib/server/ai/contracts";

const uuid = (end: string) => `00000000-0000-4000-8000-${end.padStart(12, "0")}`;
const baseInput = (text = "Dachgeschosswohnung"): CustomerAnswerClassificationInputV1 => ({
  operation: "customer_answer.canonical_classification", operationVersion: 1, schemaVersion: 1, locale: "de",
  correlation: { correlationId: "opaque-cycle-correlation", conversationId: uuid("1"), answerId: uuid("2"), decisionId: uuid("3"), attempt: 1 },
  question: { informationKey: "building_type", semanticMode: "technical_property", templateKey: "ask_building_type", templateVersion: 1 },
  answer: { text }, allowedValues: [{ key: "single_family_house", label: "Einfamilienhaus" }, { key: "apartment", label: "Wohnung" }, { key: "other", label: "Sonstiges" }],
});
const completed = (output: unknown): StructuredInferenceResult => ({ success: true, state: "completed", output, diagnostics: { latencyMs: 2, attempt: 1 } });
const failed = (failureClass: AiInferenceFailureClass): StructuredInferenceResult => ({ success: false, state: "failed", failureClass, retryable: failureClass === "timeout" || failureClass === "transient_provider_failure", diagnostics: { latencyMs: 2, attempt: 1, schemaValidation: "not_run" } });

describe("interpretCustomerAnswer", () => {
  it("lässt exakte Registry-Treffer AI-frei", async () => {
    const provider = new FakeStructuredInferenceProvider(completed({ schemaVersion: 1, result: "no_match" }));
    await expect(interpretCustomerAnswer(baseInput("Wohnung!"), provider)).resolves.toEqual({ success: true, source: "deterministic", proposal: { schemaVersion: 1, result: "matched", canonicalValue: "apartment" } });
    expect(provider.calls).toHaveLength(0);
  });

  it.each([
    [{ schemaVersion: 1, result: "matched", canonicalValue: "apartment" }, "matched"],
    [{ schemaVersion: 1, result: "no_match" }, "no_match"],
    [{ schemaVersion: 1, result: "ambiguous" }, "ambiguous"],
  ] as const)("liefert ausschließlich ein validiertes Proposal für %s", async (output, result) => {
    const provider = new FakeStructuredInferenceProvider(completed(output));
    const response = await interpretCustomerAnswer(baseInput(), provider);
    expect(response).toMatchObject({ success: true, source: "inference", proposal: { result } });
    expect(provider.calls).toHaveLength(1);
    const payload = JSON.stringify(provider.calls[0].input);
    expect(payload).not.toMatch(/phone|whatsapp|customerId|conversationId|projectId|transport|pricing|offer|media/i);
    expect(response).not.toHaveProperty("knowledgeState");
    expect(response).not.toHaveProperty("claims");
    expect(response).not.toHaveProperty("runtime");
    expect(response).not.toHaveProperty("pendingInteraction");
    expect(response).not.toHaveProperty("outboundMessage");
    expect(response).not.toHaveProperty("deliveryCommand");
  });

  it.each([
    [{ nope: true }, "invalides Schema"],
    [{ schemaVersion: 1, result: "matched", canonicalValue: "invented" }, "Wert außerhalb der Allowlist"],
    [{ schemaVersion: 2, result: "no_match" }, "falsche Schema-Version"],
  ])("weist %s deterministisch als invalid_structured_output ab", async (output, _description) => {
    const response = await interpretCustomerAnswer(baseInput(), new FakeStructuredInferenceProvider(completed(output)));
    expect(response).toMatchObject({ success: false, failure: { failureClass: "invalid_structured_output" } });
  });

  it.each(["timeout", "transient_provider_failure", "permanent_provider_failure", "refused", "unsupported", "configuration_failure"] as const)("reicht %s ausschließlich neutral weiter", async (failureClass) => {
    const response = await interpretCustomerAnswer(baseInput(), new FakeStructuredInferenceProvider(failed(failureClass)));
    expect(response).toMatchObject({ success: false, failure: { failureClass } });
  });

  it("weist leere und nicht registrierte Allowlists vor dem Provider-Aufruf ab", async () => {
    for (const allowedValues of [[], [{ key: "invented", label: "Erfunden" }]]) {
      const provider = new FakeStructuredInferenceProvider(completed({ schemaVersion: 1, result: "no_match" }));
      const response = await interpretCustomerAnswer({ ...baseInput(), allowedValues }, provider);
      expect(response).toMatchObject({ success: false, failure: { failureClass: "invalid_structured_output" } });
      expect(provider.calls).toHaveLength(0);
    }
  });
});
