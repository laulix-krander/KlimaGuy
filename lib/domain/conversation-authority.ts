import { z } from "zod";

export const CONVERSATION_STATUSES = ["open", "paused", "human_review", "closed"] as const;
export const MESSAGE_DIRECTIONS = ["inbound", "outbound", "internal"] as const;
export const MESSAGE_KINDS = ["text", "image_reference", "document_reference", "system_notice", "internal_note"] as const;
export const MESSAGE_ACTORS = ["customer", "admin", "reviewer", "system", "ai"] as const;
export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export const messageDirectionSchema = z.enum(MESSAGE_DIRECTIONS);
export const messageKindSchema = z.enum(MESSAGE_KINDS);
export const messageActorSchema = z.enum(MESSAGE_ACTORS);

const timestamp = z.string().datetime({ offset: true });
const commandKey = z.string().trim().min(8).max(128);
const textContentSchema = z.object({ type: z.literal("text"), text: z.string().min(1).max(20_000) }).strict();
const referenceContentSchema = z.object({ type: z.literal("reference"), reference_id: z.string().uuid() }).strict();
export const messageContentSchema = z.discriminatedUnion("type", [textContentSchema, referenceContentSchema]);

export const conversationDtoSchema = z.object({
  conversation_id: z.string().uuid(), customer_id: z.string().uuid().nullable(), project_id: z.string().uuid().nullable(),
  status: conversationStatusSchema, revision: z.number().int().positive(), created_at: timestamp, updated_at: timestamp,
}).strict();
export const messageDtoSchema = z.object({
  message_id: z.string().uuid(), conversation_id: z.string().uuid(), sequence: z.number().int().positive(),
  direction: messageDirectionSchema, kind: messageKindSchema, actor_class: messageActorSchema, content: messageContentSchema,
  occurred_at: timestamp, created_at: timestamp, reply_to_message_id: z.string().uuid().nullable(),
}).strict();
export const createConversationInputSchema = z.object({ customer_id: z.string().uuid().nullable().optional(), project_id: z.string().uuid().nullable().optional(), idempotency_key: commandKey }).strict();
export const assignmentInputSchema = z.object({ conversation_id: z.string().uuid(), project_id: z.string().uuid(), expected_revision: z.number().int().positive(), idempotency_key: commandKey }).strict();
export const statusTransitionInputSchema = z.object({ conversation_id: z.string().uuid(), status: conversationStatusSchema, expected_revision: z.number().int().positive(), idempotency_key: commandKey }).strict();
export const recordStaffMessageInputSchema = z.object({
  conversation_id: z.string().uuid(), direction: z.enum(["outbound", "internal"]), kind: z.enum(["text", "system_notice", "internal_note"]),
  content: textContentSchema, reply_to_message_id: z.string().uuid().nullable().optional(), idempotency_key: commandKey,
}).strict().superRefine((value, context) => {
  if ((value.kind === "internal_note") !== (value.direction === "internal")) context.addIssue({ code: z.ZodIssueCode.custom, message: "internal_note_requires_internal_direction" });
});
export const trustedRecordMessageInputSchema = z.object({
  conversation_id: z.string().uuid(), direction: messageDirectionSchema, kind: messageKindSchema, actor_class: messageActorSchema,
  content: messageContentSchema, occurred_at: timestamp, reply_to_message_id: z.string().uuid().nullable().optional(), idempotency_key: commandKey,
}).strict();
export const messageHistoryInputSchema = z.object({ conversation_id: z.string().uuid(), after_sequence: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict();

export const CONVERSATION_ERROR_CODES = ["invalid_input", "unauthorized", "conversation_not_found", "project_not_found", "customer_not_found", "project_assignment_mismatch", "stale_conversation_revision", "invalid_status_transition", "invalid_message_kind", "invalid_message_direction", "invalid_actor", "reply_message_not_found", "reply_conversation_mismatch", "duplicate_message", "persistence_failed"] as const;
export const conversationErrorCodeSchema = z.enum(CONVERSATION_ERROR_CODES);
export type ConversationDto = z.infer<typeof conversationDtoSchema>;
export type MessageDto = z.infer<typeof messageDtoSchema>;
export type ConversationResult<T> = { success: true; data: T } | { success: false; error: z.infer<typeof conversationErrorCodeSchema> };

const transitions: Readonly<Record<z.infer<typeof conversationStatusSchema>, readonly z.infer<typeof conversationStatusSchema>[]>> = {
  open: ["paused", "human_review", "closed"], paused: ["open", "closed"], human_review: ["open", "closed"], closed: [],
};
export function isConversationStatusTransitionAllowed(from: z.infer<typeof conversationStatusSchema>, to: z.infer<typeof conversationStatusSchema>) { return from === to || transitions[from].includes(to); }
