import { conversationDtoSchema, messageDtoSchema, messageHistoryInputSchema, type ConversationDto, type ConversationResult, type MessageDto } from "@/lib/domain/conversation-authority";

export type ConversationAuthorityDataSource = {
  rpc(name: "get_conversation" | "list_conversation_messages", args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export async function getConversation(ds: ConversationAuthorityDataSource, conversationId: string): Promise<ConversationResult<ConversationDto>> {
  const input = messageHistoryInputSchema.pick({ conversation_id: true }).safeParse({ conversation_id: conversationId });
  if (!input.success) return { success: false, error: "invalid_input" };
  const result = await ds.rpc("get_conversation", { target_conversation_id: input.data.conversation_id });
  if (result.error) return { success: false, error: "conversation_not_found" };
  const parsed = conversationDtoSchema.safeParse(result.data);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: "persistence_failed" };
}

export async function listConversationMessages(ds: ConversationAuthorityDataSource, input: unknown): Promise<ConversationResult<MessageDto[]>> {
  const parsedInput = messageHistoryInputSchema.safeParse(input);
  if (!parsedInput.success) return { success: false, error: "invalid_input" };
  const result = await ds.rpc("list_conversation_messages", { target_conversation_id: parsedInput.data.conversation_id, cursor_sequence: parsedInput.data.after_sequence, page_limit: parsedInput.data.limit });
  if (result.error || !Array.isArray(result.data)) return { success: false, error: "persistence_failed" };
  const parsed = messageDtoSchema.array().safeParse(result.data);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: "persistence_failed" };
}
