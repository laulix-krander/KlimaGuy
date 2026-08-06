import { attemptNumberSchema, rawCustomerAnswerSchema } from "./answer-normalization-schemas";
import type { AnswerNormalizationErrorCode, AnswerNormalizationResult, NormalizeCustomerAnswerInput, NormalizedAnswerValue, NormalizedCustomerAnswer, RawCustomerAnswer } from "./answer-normalization-types";
import { renderedCustomerInteractionSchema } from "./question-template-schemas";
import type { AnswerContract, RenderedCustomerInteraction } from "./question-template-types";

const RETRYABLE = new Set<AnswerNormalizationErrorCode>(["unsupported_input_kind", "empty_answer", "answer_too_short", "answer_too_long", "unknown_not_allowed", "skip_not_allowed", "option_not_allowed", "ambiguous_boolean", "invalid_boolean", "invalid_number", "invalid_number_range", "numeric_value_too_low", "numeric_value_too_high", "numeric_range_too_wide", "unit_mismatch", "precision_not_allowed", "normalization_failed"]);
const UNKNOWN = new Set(["weiß ich nicht", "weiss ich nicht", "keine ahnung", "kann ich nicht einschätzen", "unbekannt"]);
const SKIP = new Set(["überspringen", "ueberspringen", "möchte ich überspringen", "später", "nicht beantworten"]);
const YES = new Set(["ja", "genau", "stimmt", "richtig", "ja bitte"]);
const NO = new Set(["nein", "stimmt nicht", "falsch", "eher nicht"]);
const AMBIGUOUS = new Set(["vielleicht", "vermutlich", "denke schon", "wahrscheinlich", "eventuell", "könnte sein", "bin nicht sicher"]);
const fail = (code: AnswerNormalizationErrorCode): AnswerNormalizationResult => ({ success: false, code, retryable: RETRYABLE.has(code) });
const canonical = (value: string): string => value.trim().toLocaleLowerCase("de-DE").replace(/[.!?]+$/u, "").trim();
const base = (raw: RawCustomerAnswer) => ({ answer_id: raw.answer_id, project_id: raw.project_id, conversation_id: raw.conversation_id, decision_id: raw.decision_id, template_key: raw.template_key, template_version: raw.template_version, locale: raw.locale, submitted_at: raw.submitted_at });
const success = (raw: RawCustomerAnswer, outcome: NormalizedCustomerAnswer["outcome"], value?: NormalizedAnswerValue): AnswerNormalizationResult => ({ success: true, normalized_answer: outcome === "answered" ? { ...base(raw), outcome, value: value! } : { ...base(raw), outcome } });

function bindingError(raw: RawCustomerAnswer, interaction: RenderedCustomerInteraction): AnswerNormalizationErrorCode | undefined {
  if (raw.project_id !== interaction.project_id) return "project_mismatch";
  if (raw.conversation_id !== interaction.conversation_id) return "conversation_mismatch";
  if (raw.decision_id !== interaction.decision_id) return "decision_mismatch";
  if (raw.template_key !== interaction.template_key) return "template_key_mismatch";
  if (raw.template_version !== interaction.template_version) return "template_version_mismatch";
  if (raw.locale !== interaction.locale) return "locale_mismatch";
}

function contractError(contract: AnswerContract, interaction: RenderedCustomerInteraction): AnswerNormalizationErrorCode | undefined {
  const contractKeys = contract.options.map(({ option_key }) => option_key);
  const renderedKeys = interaction.answer_options.map(({ option_key }) => option_key);
  if (contractKeys.length !== renderedKeys.length || contractKeys.some((key, index) => key !== renderedKeys[index])) return "answer_contract_mismatch";
}

function special(raw: RawCustomerAnswer, contract: AnswerContract): AnswerNormalizationResult | undefined {
  const key = raw.raw_value.kind === "option" ? raw.raw_value.option_key : canonical(raw.raw_value.value);
  const unknown = key === "unknown" || (raw.raw_value.kind === "text" && UNKNOWN.has(key));
  const skip = key === "skip" || (raw.raw_value.kind === "text" && SKIP.has(key));
  if (unknown) return contract.allows_unknown ? success(raw, "unknown") : fail("unknown_not_allowed");
  if (skip) return contract.allows_skip ? success(raw, "skipped") : fail("skip_not_allowed");
}

function normalizeText(raw: RawCustomerAnswer, contract: AnswerContract): AnswerNormalizationResult {
  if (raw.raw_value.kind !== "text") return fail("unsupported_input_kind");
  const value = raw.raw_value.value.replace(/\r\n?/gu, "\n").trim();
  if (!value) return fail("empty_answer");
  if (contract.min_length !== undefined && value.length < contract.min_length) return fail("answer_too_short");
  if (contract.max_length !== undefined && value.length > contract.max_length) return fail("answer_too_long");
  return success(raw, "answered", { kind: "text", value });
}

function normalizeBoolean(raw: RawCustomerAnswer, contract: AnswerContract, interaction: RenderedCustomerInteraction): AnswerNormalizationResult {
  if (raw.raw_value.kind === "option") {
    const optionKey = raw.raw_value.option_key;
    if (!contract.options.some(({ option_key }) => option_key === optionKey)) return fail("option_not_allowed");
    if (optionKey === "confirm_assumption") return success(raw, "assumption_confirmed");
    if (optionKey === "reject_assumption") return success(raw, "assumption_rejected");
    if (optionKey === "defer") return success(raw, "deferred");
    if (optionKey === "yes") return success(raw, "answered", { kind: "boolean", value: true });
    if (optionKey === "no") return success(raw, "answered", { kind: "boolean", value: false });
    return fail("option_not_allowed");
  }
  const value = canonical(raw.raw_value.value);
  if (!value) return fail("empty_answer");
  if (AMBIGUOUS.has(value)) return fail("ambiguous_boolean");
  const confirmation = interaction.message_kind === "confirmation";
  if (YES.has(value)) return confirmation && contract.options.some(({ option_key }) => option_key === "confirm_assumption") ? success(raw, "assumption_confirmed") : success(raw, "answered", { kind: "boolean", value: true });
  if (NO.has(value)) return confirmation && contract.options.some(({ option_key }) => option_key === "reject_assumption") ? success(raw, "assumption_rejected") : success(raw, "answered", { kind: "boolean", value: false });
  return fail("invalid_boolean");
}

const numberToken = "(\\d+(?:[,.]\\d+)?)";
function normalizeNumber(raw: RawCustomerAnswer, contract: AnswerContract): AnswerNormalizationResult {
  if (raw.raw_value.kind !== "text") return fail("unsupported_input_kind");
  const text = raw.raw_value.value.trim().toLocaleLowerCase("de-DE");
  if (!text) return fail("empty_answer");
  if (/^-\s*\d/u.test(text)) return fail("invalid_number");
  if (/[+\-]?\d+(?:[,.]\d+)?e[+\-]?\d+/iu.test(text) || /nan|infinity|∞/iu.test(text)) return fail("invalid_number");
  const unitPart = "(?:\\s*(m²|m2|qm))?";
  const rangePatterns = [new RegExp(`^${numberToken}\\s*[-–]\\s*${numberToken}${unitPart}$`, "u"), new RegExp(`^${numberToken}\\s+bis\\s+${numberToken}${unitPart}$`, "u"), new RegExp(`^zwischen\\s+${numberToken}\\s+und\\s+${numberToken}${unitPart}$`, "u")];
  const range = rangePatterns.map((pattern) => text.match(pattern)).find(Boolean);
  const single = text.match(new RegExp(`^(?:(ca\\.|circa|ungefähr|etwa)\\s+)?${numberToken}${unitPart}$`, "u"));
  if (!range && !single) return /[a-zA-Zäöüß²]/u.test(text) ? fail("unit_mismatch") : fail(text.includes("-") || text.includes("–") || text.includes(" bis ") ? "invalid_number_range" : "invalid_number");
  const rawValues = range ? [range[1], range[2]] : [single![2]];
  const unit = range ? range[3] : single![3];
  if (unit && contract.unit !== "sqm") return fail("unit_mismatch");
  if (!contract.unit) return fail("unit_mismatch");
  if (contract.precision !== undefined && rawValues.some((item) => (item.split(/[,.]/u)[1]?.length ?? 0) > contract.precision!)) return fail("precision_not_allowed");
  const values = rawValues.map((item) => Number(item.replace(",", ".")));
  if (values.some((item) => !Number.isFinite(item) || item < 0)) return fail("invalid_number");
  if (range && values[0] > values[1]) return fail("invalid_number_range");
  if (contract.min_value !== undefined && values.some((item) => item < contract.min_value!)) return fail("numeric_value_too_low");
  if (contract.max_value !== undefined && values.some((item) => item > contract.max_value!)) return fail("numeric_value_too_high");
  return range ? success(raw, "answered", { kind: "number_range", approximation: "range", min_value: values[0], max_value: values[1], unit: "sqm" }) : success(raw, "answered", { kind: "number", approximation: single![1] ? "approximate" : "exact", value: values[0], unit: "sqm" });
}

export function normalizeCustomerAnswer(input: NormalizeCustomerAnswerInput): AnswerNormalizationResult {
  const raw = rawCustomerAnswerSchema.safeParse(input.raw_answer);
  const interaction = renderedCustomerInteractionSchema.safeParse(input.rendered_interaction);
  const attempt = attemptNumberSchema.safeParse(input.attempt_number);
  if (!raw.success || !interaction.success || !attempt.success) return fail("invalid_raw_answer");
  const binding = bindingError(raw.data, interaction.data); if (binding) return fail(binding);
  const contract = interaction.data.answer_contract; if (!contract) return fail("answer_contract_missing");
  const mismatch = contractError(contract, interaction.data); if (mismatch) return fail(mismatch);
  if (attempt.data > contract.maximum_attempts) return fail("maximum_attempts_reached");
  const recognizedSpecial = special(raw.data, contract); if (recognizedSpecial) return recognizedSpecial;
  if (raw.data.raw_value.kind === "option") { const optionKey = raw.data.raw_value.option_key; if (!contract.options.some(({ option_key }) => option_key === optionKey)) return fail("option_not_allowed"); }
  if (contract.answer_type === "text") return normalizeText(raw.data, contract);
  if (contract.answer_type === "boolean") return normalizeBoolean(raw.data, contract, interaction.data);
  if (contract.answer_type === "approximate_number") return normalizeNumber(raw.data, contract);
  return fail("unsupported_answer_type");
}

export function validateAnswerAgainstContract(input: NormalizeCustomerAnswerInput): Readonly<{ success: true }> | Exclude<AnswerNormalizationResult, { success: true }> {
  const result = normalizeCustomerAnswer(input);
  return result.success ? { success: true } : result;
}
