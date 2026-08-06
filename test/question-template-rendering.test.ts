import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANSWER_OPTION_KEYS, CONTROLLED_PARAMETER_KEYS, QUESTION_MESSAGE_KINDS, QUESTION_TEMPLATE_LOCALES, QUESTION_TEMPLATE_REGISTRY, SYNTHETIC_TEMPLATE_RENDER_FIXTURES, TEMPLATE_RENDER_ERROR_CODES, answerContractSchema, answerOptionSchema, getQuestionTemplate, listActiveQuestionTemplates, questionMessageKindSchema, questionTemplateLocaleSchema, questionTemplateSchema, renderParametersSchema, renderQuestionTemplate, renderQuestionTemplateResultSchema, renderedCustomerInteractionSchema, syntheticTemplateAction, validateQuestionTemplateRegistry } from "@/lib/domain/conversation-intelligence";

const clone = <T>(value: T): T => structuredClone(value);
const renderFixture = (key: keyof typeof SYNTHETIC_TEMPLATE_RENDER_FIXTURES) => { const [selected_action, render_parameters] = SYNTHETIC_TEMPLATE_RENDER_FIXTURES[key]; return renderQuestionTemplate({ selected_action, locale: "de", template_version: 1, render_parameters }); };

describe("Question Template Schemas", () => {
  it("schließt Locale, Message Kinds, Optionen, Parameter und Fehlercodes", () => {
    expect(QUESTION_TEMPLATE_LOCALES).toEqual(["de"]); expect(QUESTION_MESSAGE_KINDS).toHaveLength(6); expect(CONTROLLED_PARAMETER_KEYS).toHaveLength(11); expect(ANSWER_OPTION_KEYS).toContain("unknown"); expect(TEMPLATE_RENDER_ERROR_CODES).toHaveLength(12);
    expect(questionTemplateLocaleSchema.safeParse("en").success).toBe(false); expect(questionMessageKindSchema.safeParse("chat").success).toBe(false); expect(answerOptionSchema.safeParse({ option_key: "admin", label: "Admin", normalized_outcome: "yes" }).success).toBe(false);
  });
  it("validiert Template-, Answer-, Parameter-, Interaction- und Result-Verträge strikt", () => {
    const template = QUESTION_TEMPLATE_REGISTRY[0]; expect(questionTemplateSchema.safeParse(template).success).toBe(true); expect(answerContractSchema.safeParse(template.answer_contract).success).toBe(true);
    expect(questionTemplateSchema.safeParse({ ...template, primary_text: "" }).success).toBe(false); expect(questionTemplateSchema.safeParse({ ...template, template_version: 0 }).success).toBe(false); expect(questionTemplateSchema.safeParse({ ...template, locale: "en" }).success).toBe(false); expect(questionTemplateSchema.safeParse({ ...template, template_key: "runtime_key" }).success).toBe(false); expect(questionTemplateSchema.safeParse({ ...template, extra: true }).success).toBe(false);
    expect(renderParametersSchema.safeParse({ approximate_example: " 25 m² " }).success).toBe(true); expect(renderParametersSchema.safeParse({ approximate_example: "<b>25</b>" }).success).toBe(false); expect(renderParametersSchema.safeParse({ arbitrary: "x" }).success).toBe(false);
    const result = renderFixture("roomArea"); expect(renderQuestionTemplateResultSchema.safeParse(result).success).toBe(true); if (result.success) expect(renderedCustomerInteractionSchema.safeParse(result.interaction).success).toBe(true);
  });
});

describe("statische Template Registry", () => {
  it("ist valide, eindeutig, deutsch, versioniert, aktiv und tief unveränderlich", () => {
    expect(validateQuestionTemplateRegistry(QUESTION_TEMPLATE_REGISTRY)).toBe(true); expect(new Set(QUESTION_TEMPLATE_REGISTRY.map((item) => `${item.template_key}:${item.locale}:${item.template_version}`)).size).toBe(QUESTION_TEMPLATE_REGISTRY.length); expect(QUESTION_TEMPLATE_REGISTRY.every((item) => item.locale === "de" && item.template_version === 1)).toBe(true); expect(listActiveQuestionTemplates()).toHaveLength(QUESTION_TEMPLATE_REGISTRY.length); expect(Object.isFrozen(QUESTION_TEMPLATE_REGISTRY)).toBe(true); expect(Object.isFrozen(QUESTION_TEMPLATE_REGISTRY[0].answer_contract)).toBe(true);
  });
  it("erkennt Duplikate, ungültige Registries und fehlende Templates", () => {
    expect(validateQuestionTemplateRegistry([...QUESTION_TEMPLATE_REGISTRY, QUESTION_TEMPLATE_REGISTRY[0]])).toBe(false); expect(validateQuestionTemplateRegistry([{ ...QUESTION_TEMPLATE_REGISTRY[0], customer_visible: false, message_kind: "internal_notice", primary_text: "<script>" }])).toBe(false); expect(getQuestionTemplate(QUESTION_TEMPLATE_REGISTRY, "missing", "de", 1)).toBeUndefined();
  });
  it("bindet Actions, Answers und Information Keys eindeutig", () => {
    for (const template of QUESTION_TEMPLATE_REGISTRY) { expect(template.template_key).toBeTruthy(); if (template.answer_contract) expect(template.answer_contract.answer_type).toBe(template.supported_answer_type); if (template.message_kind === "question") expect(template.information_key).toBeTruthy(); }
  });
});

describe("deterministisches Rendering", () => {
  it("rendert sämtliche synthetischen Fälle ohne Mutation", () => {
    for (const key of Object.keys(SYNTHETIC_TEMPLATE_RENDER_FIXTURES) as (keyof typeof SYNTHETIC_TEMPLATE_RENDER_FIXTURES)[]) { const fixture = SYNTHETIC_TEMPLATE_RENDER_FIXTURES[key]; const before = clone(fixture); const registryBefore = clone(QUESTION_TEMPLATE_REGISTRY); const first = renderFixture(key); const second = renderFixture(key); expect(first, key).toEqual(second); expect(first.success, key).toBe(true); expect(fixture).toEqual(before); expect(QUESTION_TEMPLATE_REGISTRY).toEqual(registryBefore); }
  });
  it("rendert Raumgröße, Retry, Hilfen, Beispiele sowie Unknown und Skip", () => {
    for (const key of ["roomArea", "retryRoomArea"] as const) { const result = renderFixture(key); expect(result.success).toBe(true); if (!result.success) continue; expect(result.interaction.answer_contract).toMatchObject({ answer_type: "approximate_number", unit: "sqm", maximum_attempts: 2, allows_unknown: true, allows_skip: true }); expect(result.interaction.answer_options.map((item) => item.label)).toEqual(["Weiß ich nicht", "Möchte ich überspringen"]); expect(result.interaction.help_text).toBeTruthy(); expect(result.interaction.examples.length).toBeGreaterThan(0); }
    expect(QUESTION_TEMPLATE_REGISTRY.find((item) => item.template_key === "ask_room_area_approximate_retry")).toMatchObject({ retry_variant_of: "ask_room_area_approximate", retry_attempt: 2, information_key: "room_area_sqm" });
  });
  it("rendert Text- und Booleanverträge ohne technische Bestätigung", () => {
    expect(renderFixture("buildingType")).toMatchObject({ success: true, interaction: { examples: ["Wohnung", "Einfamilienhaus", "Dachgeschosswohnung"] } });
    for (const key of ["indoorPosition", "outdoorPosition", "lineRoute", "electrical", "accessibility"] as const) { const result = renderFixture(key); expect(result).toMatchObject({ success: true, interaction: { answer_options: [{ label: "Ja" }, { label: "Nein" }, { label: "Weiß ich nicht" }, { label: "Möchte ich überspringen" }] } }); if (result.success) expect(result.interaction.supporting_text).toContain("keine technische Bestätigung"); }
  });
  it("rendert Annahmebestätigung, Reviews, Zwischenstand und Enden kontrolliert", () => {
    const assumption = renderFixture("assumption"); expect(assumption).toMatchObject({ success: true, interaction: { message_kind: "confirmation" } }); if (assumption.success) { expect(assumption.interaction.primary_text).toContain("25 m²"); expect(assumption.interaction.supporting_text).toContain("Annahme gekennzeichnet"); expect(assumption.interaction.answer_options.map((item) => item.option_key)).toEqual(["confirm_assumption", "reject_assumption", "unknown", "defer"]); }
    expect(renderFixture("internalReview")).toMatchObject({ success: true, interaction: { customer_visible: false, message_kind: "internal_notice" } }); expect(renderFixture("visibleReview")).toMatchObject({ success: true, interaction: { customer_visible: true, primary_text: "Diesen Punkt möchten wir kurz persönlich prüfen. Wir melden uns dazu." } });
    const intermediate = renderFixture("intermediate"); if (intermediate.success) expect(intermediate.interaction.supporting_text).toContain("Bereits bekannt: Raumart\nVorläufige Annahmen: Raumgröße\nNoch offen: Leitungsweg\nNächster Schritt: offene Punkte klären");
    expect(renderFixture("paused")).toMatchObject({ success: true, interaction: { message_kind: "collection_end" } }); expect(renderFixture("siteVisit")).toMatchObject({ success: true, interaction: { message_kind: "collection_end" } });
  });
  it("liefert fail closed strukturierte Bindungs- und Parameterfehler", () => {
    const area = SYNTHETIC_TEMPLATE_RENDER_FIXTURES.roomArea[0]; const call = (selected_action: typeof area, template_version = 1, render_parameters = {}) => renderQuestionTemplate({ selected_action, locale: "de", template_version, render_parameters });
    expect(renderQuestionTemplate({ selected_action: area, locale: "en", template_version: 1, render_parameters: {} })).toEqual({ success: false, code: "locale_not_supported" }); expect(call(area, 2)).toEqual({ success: false, code: "stale_template_binding" }); expect(call({ ...area, template_version: undefined }, 2)).toEqual({ success: false, code: "template_version_not_found" }); expect(call({ ...area, template_key: undefined })).toEqual({ success: false, code: "template_not_found" }); expect(call({ ...area, action_type: "ask_text" })).toEqual({ success: false, code: "unsupported_action_type" }); expect(call({ ...area, information_key: "room_type" })).toEqual({ success: false, code: "information_key_mismatch" }); expect(call({ ...area, answer_contract: { answer_type: "text" } })).toEqual({ success: false, code: "unsupported_answer_type" }); expect(call({ ...area, answer_contract: undefined })).toEqual({ success: false, code: "unsupported_answer_type" });
    const assumption = SYNTHETIC_TEMPLATE_RENDER_FIXTURES.assumption[0]; expect(call(assumption)).toEqual({ success: false, code: "missing_render_parameter" }); expect(call(assumption, 1, { room_label: "Raum" })).toEqual({ success: false, code: "invalid_render_parameter" }); expect(call(assumption, 1, { approximate_example: "<b>25</b>" })).toEqual({ success: false, code: "invalid_render_parameter" });
    const notice = SYNTHETIC_TEMPLATE_RENDER_FIXTURES.siteCheck[0]; expect(call({ ...notice, answer_contract: { answer_type: "boolean" } })).toEqual({ success: false, code: "answer_contract_mismatch" }); expect(renderQuestionTemplate({ selected_action: area, locale: "de", template_version: 1, render_parameters: {}, registry: [...QUESTION_TEMPLATE_REGISTRY, QUESTION_TEMPLATE_REGISTRY[0]] })).toEqual({ success: false, code: "template_registry_invalid" }); expect(call({ ...area, decision_id: "invalid" })).toEqual({ success: false, code: "render_failed" });
  });
});

describe("AP-15-02-02-01 Architekturgrenze", () => {
  it("enthält nur pure kanalunabhängige Domainmodule", () => {
    const directory = "lib/domain/conversation-intelligence"; const files = readdirSync(directory).filter((file) => file.startsWith("question-template") && file.endsWith(".ts")); const source = files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'](?:@supabase|openai|anthropic)|fetch\(|axios|process\.env|Date\.now|Math\.random|["']use (?:client|server)["']|revalidatePath|localStorage|sessionStorage|request_photo|request_multiple_photos/u); expect(source).not.toMatch(/addClaim|supersedeClaim|normalizeAnswer|parseAnswer/u); expect(files.every((file) => !/route|action|service|component|\.sql$/u.test(file))).toBe(true);
  });
});
