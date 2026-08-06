import { z } from "zod";
import { ANSWER_NORMALIZATION_ERROR_CODES } from "./answer-normalization-types";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const binding = { answer_id: uuid, project_id: uuid, conversation_id: uuid, decision_id: uuid, template_key: z.string().min(1), template_version: z.number().int().positive(), locale: z.literal("de"), submitted_at: timestamp };
export const rawAnswerValueSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("text"), value: z.string() }).strict(), z.object({ kind: z.literal("option"), option_key: z.string().min(1) }).strict()]);
export const rawCustomerAnswerSchema = z.object({ ...binding, raw_value: rawAnswerValueSchema }).strict();
export const normalizedAnswerValueSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("text"), value: z.string().min(1) }).strict(), z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(), z.object({ kind: z.literal("number"), approximation: z.enum(["exact", "approximate"]), value: z.number().finite().nonnegative(), unit: z.literal("sqm") }).strict(), z.object({ kind: z.literal("number_range"), approximation: z.literal("range"), min_value: z.number().finite().nonnegative(), max_value: z.number().finite().nonnegative(), unit: z.literal("sqm") }).strict()]);
export const normalizedCustomerAnswerSchema = z.discriminatedUnion("outcome", [z.object({ ...binding, outcome: z.literal("answered"), value: normalizedAnswerValueSchema }).strict(), ...(["unknown", "skipped", "assumption_confirmed", "assumption_rejected", "deferred", "invalid"] as const).map((outcome) => z.object({ ...binding, outcome: z.literal(outcome) }).strict())]);
export const answerNormalizationErrorCodeSchema = z.enum(ANSWER_NORMALIZATION_ERROR_CODES);
export const answerNormalizationResultSchema = z.discriminatedUnion("success", [z.object({ success: z.literal(true), normalized_answer: normalizedCustomerAnswerSchema }).strict(), z.object({ success: z.literal(false), code: answerNormalizationErrorCodeSchema, retryable: z.boolean() }).strict()]);
export const attemptNumberSchema = z.number().int().positive();
