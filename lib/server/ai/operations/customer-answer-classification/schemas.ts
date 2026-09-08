import { z } from "zod";
import { ALL_PROPERTY_KEYS } from "@/lib/domain/conversation-intelligence/types";

const allowedValueSchema = z.object({ key: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200) }).strict();

export const customerAnswerClassificationInputV1Schema = z.object({
  operation: z.literal("customer_answer.canonical_classification"), operationVersion: z.literal(1), schemaVersion: z.literal(1), locale: z.literal("de"),
  correlation: z.object({ correlationId: z.string().min(1).max(200), conversationId: z.string().uuid(), answerId: z.string().uuid(), decisionId: z.string().uuid(), attempt: z.number().int().positive().default(1) }).strict(),
  question: z.object({ informationKey: z.enum(ALL_PROPERTY_KEYS), semanticMode: z.enum(["technical_property", "customer_knowledge", "customer_preference", "customer_observation", "collection_capability"]), templateKey: z.string().min(1).max(200), templateVersion: z.number().int().positive() }).strict(),
  answer: z.object({ text: z.string().trim().min(1).max(2_000) }).strict(),
  allowedValues: z.array(allowedValueSchema).min(1).max(50),
}).strict().superRefine((value, context) => {
  if (new Set(value.allowedValues.map(({ key }) => key)).size !== value.allowedValues.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedValues"], message: "Canonical keys must be unique" });
});

export const customerAnswerClassificationProviderInputV1Schema = z.object({
  schemaVersion: z.literal(1), informationKey: z.enum(ALL_PROPERTY_KEYS), semanticMode: z.enum(["technical_property", "customer_knowledge", "customer_preference", "customer_observation", "collection_capability"]),
  answer: z.object({ text: z.string().trim().min(1).max(2_000) }).strict(), allowedValues: z.array(allowedValueSchema).min(1).max(50),
}).strict();

export const customerAnswerClassificationProposalV1Schema = z.discriminatedUnion("result", [
  z.object({ schemaVersion: z.literal(1), result: z.literal("matched"), canonicalValue: z.string().trim().min(1).max(100) }).strict(),
  z.object({ schemaVersion: z.literal(1), result: z.literal("no_match") }).strict(),
  z.object({ schemaVersion: z.literal(1), result: z.literal("ambiguous") }).strict(),
]);

export type CustomerAnswerClassificationInputV1 = z.input<typeof customerAnswerClassificationInputV1Schema>;
export type CustomerAnswerClassificationProposalV1 = z.infer<typeof customerAnswerClassificationProposalV1Schema>;
