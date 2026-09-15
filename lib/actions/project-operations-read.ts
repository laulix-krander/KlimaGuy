import { conversationDtoSchema, messageDtoSchema, type ConversationDto, type MessageDto } from "@/lib/domain/conversation-authority";
import { mvpProjectFactSchema, type MvpProjectFact } from "@/lib/domain/mvp-project-facts";
import { mapConversationWorkspace } from "@/lib/domain/project-operations-read-model";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import type { ProjectMediaGalleryItem } from "./project-media-gallery-service";

/** Staff-only, PII-minimal read composition over existing canonical persistence. */
export async function readProjectOperations(projectId: string, media: readonly ProjectMediaGalleryItem[] = []) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { authorized: false as const, facts: [], conversations: [] };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success || role.data === "system") return { authorized: false as const, facts: [], conversations: [] };

  const [{ data: factRows }, { data: conversationRows }] = await Promise.all([
    supabase.from("mvp_project_facts").select("fact_key,fact_value").eq("project_id", projectId),
    supabase.from("conversations").select("id,customer_id,current_project_id,status,revision,created_at,updated_at").eq("current_project_id", projectId).order("created_at", { ascending: false }),
  ]);
  const facts = (factRows ?? []).flatMap((row) => {
    const parsed = mvpProjectFactSchema.safeParse({ key: row.fact_key, value: row.fact_value });
    return parsed.success ? [parsed.data] : [];
  }) as MvpProjectFact[];
  const conversations = (conversationRows ?? []).flatMap((row) => {
    const parsed = conversationDtoSchema.safeParse({ conversation_id: row.id, customer_id: row.customer_id, project_id: row.current_project_id, status: row.status, revision: row.revision, created_at: row.created_at, updated_at: row.updated_at });
    return parsed.success ? [parsed.data] : [];
  }) as ConversationDto[];
  const messages = (await Promise.all(conversations.map(async (conversation) => {
    const collected: MessageDto[] = []; let cursor = 0;
    while (true) {
      const { data, error } = await supabase.rpc("list_conversation_messages", { target_conversation_id: conversation.conversation_id, cursor_sequence: cursor, page_limit: 100 });
      const parsed = messageDtoSchema.array().safeParse(data);
      if (error || !parsed.success) break;
      collected.push(...parsed.data);
      if (parsed.data.length < 100) break;
      cursor = parsed.data.at(-1)?.sequence ?? cursor;
    }
    return collected;
  }))).flat() as MessageDto[];
  const mediaByMessage = new Map(media.flatMap((item) => item.source_message_id && item.signed_view_url ? [[item.source_message_id, item.signed_view_url] as const] : []));
  return { authorized: true as const, facts, conversations: mapConversationWorkspace(conversations, messages, mediaByMessage) };
}
