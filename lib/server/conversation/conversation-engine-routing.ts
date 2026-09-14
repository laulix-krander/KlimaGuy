import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CONVERSATION_ENGINE_OWNERS,
  selectConversationEngine,
  type ConversationEngineOwner,
  type ConversationRoutingIdentity,
} from "@/lib/domain/conversation-engine";
import { classifyRuntimeRpcError } from "./runtime-rpc-diagnostics";

const resultSchema = z.object({
  conversation_id: z.string().uuid(),
  engine_owner: z.enum(CONVERSATION_ENGINE_OWNERS),
}).strict();

export type ConversationEngineResolution = z.infer<typeof resultSchema>;
export type ConversationEngineResolver = (input: ConversationRoutingIdentity & {
  conversation_id: string;
}) => Promise<ConversationEngineResolution>;

export async function resolveConversationEngine(
  source: { rpc(name: "resolve_conversation_engine_owner", args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> },
  input: ConversationRoutingIdentity & { conversation_id: string },
  mvpEnabled?: boolean,
): Promise<ConversationEngineResolution> {
  const proposedOwner: ConversationEngineOwner = selectConversationEngine(input, mvpEnabled);
  const { data, error } = await source.rpc("resolve_conversation_engine_owner", {
    target_conversation_id: input.conversation_id,
    target_provider: input.provider,
    target_sender_scope: input.sender_scope,
    target_external_identity: input.external_identity,
    proposed_owner: proposedOwner,
  });
  if (error) {
    console.error("conversation_engine_rpc_failed", {
      operation: "resolve_conversation_engine_owner",
      ...classifyRuntimeRpcError(error),
    });
    throw new Error("conversation_engine_resolution_failed");
  }
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success) throw new Error("conversation_engine_resolution_failed");
  return parsed.data;
}

export const resolveProductiveConversationEngine: ConversationEngineResolver = async (input) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("conversation_engine_configuration_error");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return resolveConversationEngine(client, input);
};
