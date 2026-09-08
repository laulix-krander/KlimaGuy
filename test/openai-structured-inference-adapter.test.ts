import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { OpenAiStructuredInferenceProvider } from "@/lib/server/ai/providers/openai/adapter";
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_TIMEOUT_MS, readOpenAiProviderConfig } from "@/lib/server/ai/providers/openai/config";
import { OPENAI_CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS_V1 } from "@/lib/server/ai/providers/openai/instructions";
import type { StructuredInferenceRequest } from "@/lib/server/ai/contracts";
import { interpretCustomerAnswer } from "@/lib/server/ai/operations/customer-answer-classification/operation";

const request: StructuredInferenceRequest = {
  operationKey: "customer_answer.canonical_classification",
  operationVersion: 1,
  inputSchemaVersion: 1,
  outputSchemaVersion: 1,
  locale: "de",
  correlation: { correlationId: "local-only", attempt: 2 },
  instructions: { templateKey: "customer_answer_canonical_classification_de", version: 1 },
  input: {
    schemaVersion: 1,
    informationKey: "building_type",
    semanticMode: "technical_property",
    answer: { text: "Dachgeschosswohnung" },
    allowedValues: [
      { key: "apartment", label: "Wohnung" },
      { key: "single_family_house", label: "Einfamilienhaus" },
    ],
  },
};

const env = { OPENAI_API_KEY: "unit-test-secret", OPENAI_MODEL: "configured-model", OPENAI_TIMEOUT_MS: "4321" };
const response = (output_parsed: unknown, additions: Record<string, unknown> = {}) => ({ status: "completed", output_parsed, output: [], ...additions });

function adapterReturning(providerResponse: unknown) {
  const parse = vi.fn().mockResolvedValue(providerResponse);
  const clientFactory = vi.fn(() => ({ responses: { parse } }));
  return { provider: new OpenAiStructuredInferenceProvider({ environment: env, clientFactory, now: () => 100 }), parse, clientFactory };
}

describe("OpenAiStructuredInferenceProvider", () => {
  it.each([
    [{ schemaVersion: 1, result: "matched", canonicalValue: "apartment" }, { schemaVersion: 1, result: "matched", canonicalValue: "apartment" }],
    [{ schemaVersion: 1, result: "no_match", canonicalValue: null }, { schemaVersion: 1, result: "no_match" }],
    [{ schemaVersion: 1, result: "ambiguous", canonicalValue: null }, { schemaVersion: 1, result: "ambiguous" }],
  ])("mappt erfolgreichen Structured Output %#", async (parsed, expected) => {
    const { provider } = adapterReturning(response(parsed));
    await expect(provider.generateStructuredInference(request)).resolves.toMatchObject({
      success: true,
      output: expected,
      diagnostics: { attempt: 2 },
    });
  });

  it("mappt ausschließlich den minimierten neutralen Input in einen stateless Responses-Request", async () => {
    const { provider, parse, clientFactory } = adapterReturning(response({ schemaVersion: 1, result: "no_match", canonicalValue: null }));
    await provider.generateStructuredInference(request);

    expect(clientFactory).toHaveBeenCalledWith({ apiKey: "unit-test-secret", model: "configured-model", timeoutMs: 4321 });
    expect(parse).toHaveBeenCalledOnce();
    const openAiRequest = parse.mock.calls[0][0];
    expect(openAiRequest).toMatchObject({ model: "configured-model", instructions: OPENAI_CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS_V1 });
    expect(openAiRequest.text.format).toBeDefined();
    expect(JSON.parse(openAiRequest.input)).toEqual({ locale: "de", ...request.input as object });
    expect(openAiRequest).not.toHaveProperty("previous_response_id");
    expect(openAiRequest).not.toHaveProperty("tools");
    expect(JSON.stringify(openAiRequest)).not.toMatch(/local-only|conversationId|history|whatsapp|phone|customerId|projectId|pricing|offerId|media/i);
    expect(openAiRequest.instructions).toContain("Allowlist");
    expect(openAiRequest.instructions).toContain("no_match");
    expect(openAiRequest.instructions).toContain("ambiguous");
    expect(openAiRequest.instructions).toContain("keine Claims");
    expect(openAiRequest.instructions).toContain("keine Preise oder Angebote");
  });

  it.each([
    [response(undefined), "fehlender Parsed Output"],
    [response({ result: "no_match", canonicalValue: null }), "fehlende Schema-Version"],
    [response({ schemaVersion: 1, result: "matched", canonicalValue: null }), "fehlender Match-Wert"],
    [response({ schemaVersion: 1, result: "no_match", canonicalValue: "apartment" }, { output_text: "unchecked" }), "inkonsistenter Wert ohne Freitext-Fallback"],
    [{ status: "incomplete", output_parsed: { schemaVersion: 1, result: "no_match", canonicalValue: null } }, "incomplete Response"],
  ])("weist %s als invalid_structured_output ab", async (providerResponse, _label) => {
    const { provider } = adapterReturning(providerResponse);
    await expect(provider.generateStructuredInference(request)).resolves.toMatchObject({ success: false, failureClass: "invalid_structured_output" });
  });

  it("mappt eine Provider-Refusal ohne Parsed-Output-Fallback", async () => {
    const { provider } = adapterReturning({ status: "completed", output_text: "ignored", output: [{ content: [{ type: "refusal" }] }] });
    await expect(provider.generateStructuredInference(request)).resolves.toMatchObject({ success: false, failureClass: "refused" });
  });

  it.each([
    [{ name: "APIConnectionTimeoutError" }, "timeout"],
    [{ status: 429 }, "transient_provider_failure"],
    [{ status: 503 }, "transient_provider_failure"],
    [{ status: 401 }, "configuration_failure"],
    [{ status: 404 }, "unsupported"],
    [{ status: 400 }, "permanent_provider_failure"],
  ])("mappt Providerfehler %# neutral", async (providerError, expected) => {
    const parse = vi.fn().mockRejectedValue(providerError);
    const provider = new OpenAiStructuredInferenceProvider({ environment: env, clientFactory: () => ({ responses: { parse } }), now: () => 100 });
    await expect(provider.generateStructuredInference(request)).resolves.toMatchObject({ success: false, failureClass: expected });
  });

  it("weist einen Canonical Value außerhalb der Allowlist spätestens an der Domain Boundary ab", async () => {
    const { provider } = adapterReturning(response({ schemaVersion: 1, result: "matched", canonicalValue: "invented" }));
    await expect(interpretCustomerAnswer({
      operation: "customer_answer.canonical_classification",
      operationVersion: 1,
      schemaVersion: 1,
      locale: "de",
      correlation: {
        correlationId: "local-only",
        conversationId: "00000000-0000-4000-8000-000000000001",
        answerId: "00000000-0000-4000-8000-000000000002",
        decisionId: "00000000-0000-4000-8000-000000000003",
        attempt: 2,
      },
      question: { informationKey: "building_type", semanticMode: "technical_property", templateKey: "ask_building_type", templateVersion: 1 },
      answer: { text: "Dachgeschosswohnung" },
      allowedValues: request.input && typeof request.input === "object" && "allowedValues" in request.input
        ? request.input.allowedValues as Array<{ key: string; label: string }>
        : [],
    }, provider)).resolves.toMatchObject({ success: false, failure: { failureClass: "invalid_structured_output" } });
  });
});

describe("OpenAI Server-Konfiguration", () => {
  it("liefert Default-Modell und Default-Timeout", () => {
    expect(readOpenAiProviderConfig({ OPENAI_API_KEY: "secret" })).toEqual({ success: true, config: { apiKey: "secret", model: DEFAULT_OPENAI_MODEL, timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS } });
  });

  it("akzeptiert konfiguriertes Modell und gültigen Timeout", () => {
    expect(readOpenAiProviderConfig(env)).toEqual({ success: true, config: { apiKey: "unit-test-secret", model: "configured-model", timeoutMs: 4321 } });
  });

  it.each([{ OPENAI_MODEL: "x" }, { OPENAI_API_KEY: "secret", OPENAI_TIMEOUT_MS: "abc" }, { OPENAI_API_KEY: "secret", OPENAI_TIMEOUT_MS: "999" }, { OPENAI_API_KEY: "secret", OPENAI_TIMEOUT_MS: "60001" }])("weist fehlende oder invalide Konfiguration ohne Secret-Leak ab", async (environment) => {
    const provider = new OpenAiStructuredInferenceProvider({ environment, clientFactory: () => { throw new Error("darf nicht aufgerufen werden"); } });
    const result = await provider.generateStructuredInference(request);
    expect(result).toMatchObject({ success: false, failureClass: "configuration_failure" });
    expect(JSON.stringify(result)).not.toContain(environment.OPENAI_API_KEY ?? "unit-test-secret");
  });
});

describe("OpenAI-Isolation", () => {
  it("hält SDK, Credential und Adapter aus Domain und produktivem Cycle heraus", () => {
    const repositoryRoot = process.cwd();
    const protectedFiles = [
      "lib/server/ai/contracts.ts",
      "lib/server/ai/schemas.ts",
      "lib/server/ai/operations/customer-answer-classification/operation.ts",
      "lib/server/conversation/productive-cycle-runtime.ts",
      "lib/server/conversation/recoverable-cycle-runner.ts",
    ];
    for (const file of protectedFiles) {
      const source = readFileSync(join(repositoryRoot, file), "utf8");
      expect(source, file).not.toMatch(/from ["']openai|OPENAI_API_KEY|OpenAiStructuredInferenceProvider/u);
    }
  });
});
