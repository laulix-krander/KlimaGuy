import { z } from "zod";
import { plannerActionTypeSchema } from "./question-planner-schemas";
import { PLANNER_ANSWER_TYPES, TEMPLATE_KEYS } from "./question-planner-types";
import { ALL_PROPERTY_KEYS } from "./types";
import { ANSWER_OPTION_KEYS, ANSWER_VALIDATION_ERROR_CODES, CONTROLLED_PARAMETER_KEYS, NORMALIZED_OUTCOMES, QUESTION_MESSAGE_KINDS, QUESTION_TEMPLATE_LOCALES, QUESTION_TEMPLATE_STATUSES, TEMPLATE_RENDER_ERROR_CODES } from "./question-template-types";

const unsafeText = /<[^>]*>|https?:\/\/|www\.|\b(?:bearer|token)\b|\{\{?|\}\}?/iu;
const safeText = (maximum: number) => z.string().trim().min(1).max(maximum).refine((value) => !unsafeText.test(value), "unsafe_text");
export const questionTemplateLocaleSchema = z.enum(QUESTION_TEMPLATE_LOCALES);
export const questionMessageKindSchema = z.enum(QUESTION_MESSAGE_KINDS);
export const controlledParameterKeySchema = z.enum(CONTROLLED_PARAMETER_KEYS);
export const templateRenderErrorCodeSchema = z.enum(TEMPLATE_RENDER_ERROR_CODES);
export const answerOptionSchema = z.object({ option_key: z.enum(ANSWER_OPTION_KEYS), label: safeText(80), normalized_outcome: z.enum(NORMALIZED_OUTCOMES) }).strict();
export const answerContractSchema = z.object({ answer_type: z.enum(PLANNER_ANSWER_TYPES).refine((value) => value !== "unknown" && value !== "skip"), required: z.boolean(), allows_unknown: z.boolean(), allows_skip: z.boolean(), min_length: z.number().int().positive().optional(), max_length: z.number().int().positive().optional(), min_value: z.number().nonnegative().optional(), max_value: z.number().positive().optional(), unit: z.literal("sqm").optional(), precision: z.number().int().min(0).max(2).optional(), options: z.array(answerOptionSchema).readonly(), examples: z.array(safeText(80)).max(5).readonly(), validation_error_code: z.enum(ANSWER_VALIDATION_ERROR_CODES), maximum_attempts: z.number().int().min(1).max(2) }).strict().superRefine((contract, context) => {
  const keys = contract.options.map((option) => option.option_key);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "duplicate_option" });
  if (contract.allows_unknown !== keys.includes("unknown") || contract.allows_skip !== keys.includes("skip")) context.addIssue({ code: "custom", message: "outcome_option_mismatch" });
  if (contract.answer_type === "boolean" && (!["yes", "no"].every((key) => keys.includes(key as "yes")) && !["confirm_assumption", "reject_assumption"].every((key) => keys.includes(key as "confirm_assumption")))) context.addIssue({ code: "custom", message: "boolean_options_missing" });
  if (contract.min_length && contract.max_length && contract.min_length > contract.max_length) context.addIssue({ code: "custom", message: "length_range_invalid" });
  if (contract.min_value !== undefined && contract.max_value !== undefined && contract.min_value > contract.max_value) context.addIssue({ code: "custom", message: "value_range_invalid" });
});
const textFields = { primary_text: safeText(300), supporting_text: safeText(240).optional(), help_text: safeText(240).optional(), accessibility_text: safeText(400).optional() };
export const questionTemplateSchema = z.object({ template_key: z.enum(TEMPLATE_KEYS), template_version: z.number().int().positive(), locale: questionTemplateLocaleSchema, message_kind: questionMessageKindSchema, supported_action_type: plannerActionTypeSchema, supported_answer_type: z.enum(PLANNER_ANSWER_TYPES).refine((value) => value !== "unknown" && value !== "skip").optional(), information_key: z.enum(ALL_PROPERTY_KEYS).optional(), ...textFields, examples: z.array(safeText(80)).max(5).readonly(), controlled_parameter_keys: z.array(controlledParameterKeySchema).readonly(), answer_contract: answerContractSchema.optional(), retry_variant_of: z.enum(TEMPLATE_KEYS).optional(), retry_attempt: z.number().int().min(2).max(2).optional(), customer_visible: z.boolean(), status: z.enum(QUESTION_TEMPLATE_STATUSES) }).strict().superRefine((template, context) => {
  if (template.message_kind === "internal_notice" && template.customer_visible) context.addIssue({ code: "custom", message: "internal_visibility_invalid" });
  if (template.message_kind === "question" && !template.answer_contract) context.addIssue({ code: "custom", message: "answer_contract_required" });
  if (template.message_kind === "confirmation" && (!template.answer_contract || !template.answer_contract.options.some((option) => option.option_key === "confirm_assumption"))) context.addIssue({ code: "custom", message: "confirmation_contract_required" });
  if (template.answer_contract?.answer_type !== template.supported_answer_type) context.addIssue({ code: "custom", message: "supported_answer_mismatch" });
  if (Boolean(template.retry_variant_of) !== Boolean(template.retry_attempt)) context.addIssue({ code: "custom", message: "retry_binding_invalid" });
});
const parameterValue = z.union([safeText(160), z.array(safeText(160)).min(1).max(12).readonly()]);
export const renderParametersSchema = z.object(Object.fromEntries(CONTROLLED_PARAMETER_KEYS.map((key) => [key, parameterValue.optional()])) as Record<typeof CONTROLLED_PARAMETER_KEYS[number], z.ZodOptional<typeof parameterValue>>).strict();
export const renderedCustomerInteractionSchema = z.object({ template_key: z.enum(TEMPLATE_KEYS), template_version: z.number().int().positive(), locale: questionTemplateLocaleSchema, message_kind: questionMessageKindSchema, ...textFields, examples: z.array(safeText(80)).readonly(), answer_contract: answerContractSchema.optional(), answer_options: z.array(answerOptionSchema).readonly(), customer_visible: z.boolean() }).strict();
export const renderQuestionTemplateResultSchema = z.discriminatedUnion("success", [z.object({ success: z.literal(true), interaction: renderedCustomerInteractionSchema }).strict(), z.object({ success: z.literal(false), code: templateRenderErrorCodeSchema }).strict()]);
