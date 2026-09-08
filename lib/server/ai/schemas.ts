import { z } from "zod";
import { AI_INFERENCE_FAILURE_CLASSES, AI_OPERATION_KEYS } from "./contracts";

const diagnosticsSchema = z.object({ latencyMs: z.number().finite().nonnegative(), attempt: z.number().int().positive() }).strict();

export const structuredInferenceRequestSchema = z.object({
  operationKey: z.enum(AI_OPERATION_KEYS),
  operationVersion: z.literal(1),
  inputSchemaVersion: z.literal(1),
  outputSchemaVersion: z.literal(1),
  locale: z.literal("de"),
  correlation: z.object({ correlationId: z.string().min(1).max(200), attempt: z.number().int().positive() }).strict(),
  instructions: z.object({ templateKey: z.literal("customer_answer_canonical_classification_de"), version: z.literal(1) }).strict(),
  input: z.unknown(),
}).strict();

const successSchema = z.object({
  success: z.literal(true), state: z.literal("completed"), output: z.unknown(),
  usage: z.object({ inputUnits: z.number().int().nonnegative().optional(), outputUnits: z.number().int().nonnegative().optional(), totalUnits: z.number().int().nonnegative().optional() }).strict().optional(),
  diagnostics: diagnosticsSchema,
}).strict();

const failureSchema = z.object({
  success: z.literal(false), state: z.literal("failed"), failureClass: z.enum(AI_INFERENCE_FAILURE_CLASSES), retryable: z.boolean(),
  diagnostics: diagnosticsSchema.extend({ schemaValidation: z.enum(["not_run", "valid", "invalid"]) }).strict(),
}).strict();

export const structuredInferenceResultSchema = z.discriminatedUnion("success", [successSchema, failureSchema]);
