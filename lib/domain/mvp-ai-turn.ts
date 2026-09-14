import { z } from "zod";
import {
  MVP_PROJECT_FACT_KEYS,
  MVP_REQUIRED_PHOTO_CATEGORIES,
  mvpProjectFactKeySchema,
  mvpProjectFactSchema,
} from "./mvp-project-facts";

export const MVP_QUALIFICATION_STATUSES = [
  "in_progress",
  "ready_for_offer",
  "needs_human",
] as const;

export const MVP_HUMAN_ESCALATION_REASONS = [
  "customer_request",
  "conflicting_information",
  "safety_concern",
  "unsupported_request",
  "requires_site_check",
] as const;

const uuid = z.string().uuid();

export const mvpAiTurnInputObjectSchema = z.object({
  turn: z.object({
    inbound_message_id: uuid,
    conversation_id: uuid,
    expected_conversation_revision: z.number().int().nonnegative(),
    binding_id: uuid,
    binding_revision: z.number().int().positive(),
    project_id: uuid,
  }).strict(),
  project: z.object({
    title: z.string().trim().min(1).max(180),
  }).strict(),
  persisted_facts: z.array(mvpProjectFactSchema).max(MVP_PROJECT_FACT_KEYS.length),
  inbound: z.object({
    message_id: uuid,
    text: z.string().trim().min(1).max(4_000).nullable(),
  }).strict(),
  transcript: z.array(z.object({
    message_id: uuid,
    sequence: z.number().int().positive(),
    direction: z.enum(["inbound", "outbound"]),
    text: z.string().trim().min(1).max(4_000),
  }).strict()).max(100),
  ready_media: z.array(z.object({
    media_id: uuid,
    category: z.enum(MVP_REQUIRED_PHOTO_CATEGORIES),
    mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    caption: z.string().trim().min(1).max(1_000).nullable(),
    image_data: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  }).strict()).max(20),
}).strict();

export const mvpAiTurnInputSchema = mvpAiTurnInputObjectSchema.superRefine((input, context) => {
  if (input.inbound.message_id !== input.turn.inbound_message_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["inbound", "message_id"], message: "inbound_message_mismatch" });
  }
  if (new Set(input.persisted_facts.map(({ key }) => key)).size !== input.persisted_facts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["persisted_facts"], message: "duplicate_fact_key" });
  }
});

export const mvpQualificationStatusSchema = z.enum(MVP_QUALIFICATION_STATUSES);
export const mvpHumanEscalationReasonSchema = z.enum(MVP_HUMAN_ESCALATION_REASONS);

export const mvpAiTurnResultSchema = z.object({
  reply_text: z.string().trim().min(1).max(4_000),
  facts_patch: z.array(mvpProjectFactSchema).max(MVP_PROJECT_FACT_KEYS.length),
  missing_facts: z.array(mvpProjectFactKeySchema).max(MVP_PROJECT_FACT_KEYS.length),
  qualification_status: mvpQualificationStatusSchema,
  needs_human: z.boolean(),
  human_reason: mvpHumanEscalationReasonSchema.nullable(),
}).strict().superRefine((result, context) => {
  if (new Set(result.facts_patch.map(({ key }) => key)).size !== result.facts_patch.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["facts_patch"], message: "duplicate_fact_key" });
  }
  if (new Set(result.missing_facts).size !== result.missing_facts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["missing_facts"], message: "duplicate_missing_fact" });
  }
  if (result.facts_patch.some(({ key }) => result.missing_facts.includes(key))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["missing_facts"], message: "patched_fact_cannot_be_missing" });
  }
  if (result.qualification_status === "ready_for_offer" && result.missing_facts.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["missing_facts"], message: "ready_turn_cannot_have_missing_facts" });
  }
  if (result.needs_human !== (result.qualification_status === "needs_human")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["needs_human"], message: "human_status_mismatch" });
  }
  if (result.needs_human !== (result.human_reason !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["human_reason"], message: "human_reason_mismatch" });
  }
});

export type MvpAiTurnInput = Readonly<z.infer<typeof mvpAiTurnInputSchema>>;
export type MvpAiTurnResult = Readonly<z.infer<typeof mvpAiTurnResultSchema>>;
