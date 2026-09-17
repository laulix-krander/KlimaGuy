import { z } from "zod";
import {
  MVP_PROJECT_FACT_KEYS,
  MVP_REQUIRED_PHOTO_CATEGORIES,
  mvpProjectFactKeySchema,
  mvpProjectFactSchema,
} from "./mvp-project-facts";
import { MVP_OFFER_REQUIRED_FACT_GROUPS } from "./mvp-qualification-readiness";

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
const customerNameComponentSchema = z.string().trim().min(1).max(120).nullable();
export const mvpVisionObservationSchema = z.string().trim().min(1).max(240).refine(
  (text) => !/(technisch (?:geeignet|geprüft|freigegeben)|tragfähig|stromkreis (?:ausreichend|geeignet)|kernbohrung (?:sicher|möglich)|vor ort (?:geprüft|besichtigt)|\b\d+(?:[,.]\d+)?\s*(?:cm|mm|m)\b)/iu.test(text),
  "vision_observation_overclaims",
);
export const mvpMediaClassificationSchema = z.object({
  media_id: uuid,
  category: z.union([z.enum(MVP_REQUIRED_PHOTO_CATEGORIES), z.literal("other")]),
  observation: mvpVisionObservationSchema.nullable(),
}).strict();

export const mvpCustomerNamePatchSchema = z.object({
  first_name: customerNameComponentSchema,
  last_name: customerNameComponentSchema,
}).strict().superRefine((patch, context) => {
  if (patch.first_name === null && patch.last_name === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "customer_name_patch_empty" });
  }
});

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
    status: z.enum(["new", "collecting_information", "technical_review", "human_review", "quote_draft", "quote_sent", "accepted", "rejected", "closed"]).default("collecting_information"),
    requires_human_review: z.boolean().default(false),
  }).strict(),
  customer: z.object({
    name_known: z.boolean(),
    first_name: customerNameComponentSchema,
    last_name: customerNameComponentSchema,
  }).strict().superRefine((customer, context) => {
    if (customer.name_known !== (customer.first_name !== null || customer.last_name !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["name_known"], message: "customer_name_known_mismatch" });
    }
  }),
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
    category: z.union([z.enum(MVP_REQUIRED_PHOTO_CATEGORIES), z.literal("other")]),
    mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    caption: z.string().trim().min(1).max(1_000).nullable(),
    image_data: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  }).strict()).max(20),
  project_photo_coverage: z.array(z.object({ category: z.enum(MVP_REQUIRED_PHOTO_CATEGORIES), count: z.number().int().positive() }).strict()).max(MVP_REQUIRED_PHOTO_CATEGORIES.length).default([]),
  qualification_context: z.object({
    collection_active: z.boolean(),
    missing_facts: z.array(mvpProjectFactKeySchema).max(MVP_OFFER_REQUIRED_FACT_GROUPS.length),
    missing_photos: z.array(z.enum(MVP_REQUIRED_PHOTO_CATEGORIES)).max(MVP_REQUIRED_PHOTO_CATEGORIES.length),
    requires_site_check: z.boolean(),
  }).strict(),
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
  qualification_status: mvpQualificationStatusSchema,
  needs_human: z.boolean(),
  human_reason: mvpHumanEscalationReasonSchema.nullable(),
  customer_name_patch: mvpCustomerNamePatchSchema.nullable(),
  media_classifications: z.array(mvpMediaClassificationSchema).max(20).default([]),
}).strict().superRefine((result, context) => {
  if (new Set(result.facts_patch.map(({ key }) => key)).size !== result.facts_patch.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["facts_patch"], message: "duplicate_fact_key" });
  }
  if (result.needs_human !== (result.qualification_status === "needs_human")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["needs_human"], message: "human_status_mismatch" });
  }
  if (result.needs_human !== (result.human_reason !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["human_reason"], message: "human_reason_mismatch" });
  }
  if (new Set(result.media_classifications.map(({ media_id }) => media_id)).size !== result.media_classifications.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["media_classifications"], message: "duplicate_media_id" });
});

export type MvpAiTurnInput = Readonly<z.infer<typeof mvpAiTurnInputSchema>>;
export type MvpAiTurnResult = Readonly<z.infer<typeof mvpAiTurnResultSchema>>;
