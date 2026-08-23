import { z } from "zod";
import {
  conversationRuntimeHeaderSchema,
  pendingInteractionSchema,
  runtimeCollectionRowSchema,
  runtimeEffortRowSchema,
  runtimeEvidenceRequestRowSchema,
  runtimeRetryRowSchema,
} from "@/lib/domain/conversation-runtime";

const runtimeInspectorSchema = z.object({
  runtime: conversationRuntimeHeaderSchema,
  pending_interaction: pendingInteractionSchema.nullable(),
  collection: z.array(runtimeCollectionRowSchema), retry: z.array(runtimeRetryRowSchema),
  effort: runtimeEffortRowSchema, evidence_requests: z.array(runtimeEvidenceRequestRowSchema),
}).strict();
export type ConversationRuntimeInspector = z.infer<typeof runtimeInspectorSchema>;

export type RuntimeReadDataSource = {
  rpc(name: "get_conversation_runtime", args: { target_conversation_id: string }): Promise<{ data: unknown; error: unknown }>;
};

/** A single set-oriented RPC load; invalid persistence fails closed instead of inventing defaults. */
export async function getConversationRuntime(ds: RuntimeReadDataSource, conversationId: string): Promise<{ success: true; data: ConversationRuntimeInspector } | { success: false; error: "invalid_input" | "not_found" | "invalid_persistence" }> {
  if (!z.string().uuid().safeParse(conversationId).success) return { success: false, error: "invalid_input" };
  const result = await ds.rpc("get_conversation_runtime", { target_conversation_id: conversationId });
  if (result.error || result.data === null) return { success: false, error: "not_found" };
  const parsed = runtimeInspectorSchema.safeParse(result.data);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: "invalid_persistence" };
}
