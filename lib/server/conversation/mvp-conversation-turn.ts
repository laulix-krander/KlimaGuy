import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { mvpAiTurnInputObjectSchema, mvpAiTurnInputSchema, mvpAiTurnResultSchema, type MvpAiTurnInput, type MvpAiTurnResult } from "@/lib/domain/mvp-ai-turn";
import type { MvpAiTurnProvider } from "@/lib/server/ai/mvp-turn-provider";
import { OpenAiMvpTurnProvider } from "@/lib/server/ai/providers/openai/mvp-turn-adapter";
import { getProjectFacts, type ProjectFactsRpc } from "@/lib/server/project-facts/project-facts";

const uuid = z.string().uuid();
const acquiredSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("acquired"), turn_id: uuid, turn: mvpAiTurnInputObjectSchema.shape.turn,
    project: mvpAiTurnInputObjectSchema.shape.project, inbound: mvpAiTurnInputObjectSchema.shape.inbound,
    transcript: mvpAiTurnInputObjectSchema.shape.transcript, ready_media: mvpAiTurnInputObjectSchema.shape.ready_media }).strict(),
  z.object({ status: z.literal("busy"), turn_id: uuid, outbound_message_id: uuid.nullable() }).strict(),
  z.object({ status: z.literal("completed"), turn_id: uuid, outbound_message_id: uuid.nullable() }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
  z.object({ status: z.literal("invalid_message") }).strict(),
]);
const committedSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed"), outbound_message_id: uuid }).strict(),
  z.object({ status: z.literal("stale") }).strict(),
]);

export type MvpTurnStore = ProjectFactsRpc & {
  acquire(conversationId: string, inboundMessageId: string): Promise<unknown>;
  commit(turnId: string, result: MvpAiTurnResult): Promise<unknown>;
  fail(turnId: string, code: "provider_failure" | "invalid_provider_output" | "commit_failed"): Promise<void>;
};

export type MvpTurnRunResult = Readonly<
  { status: "completed"; outbound_message_id: string; turn: MvpAiTurnResult } |
  { status: "duplicate" | "not_applicable" }
>;

export class MvpConversationTurnError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "MvpConversationTurnError"; }
}

export async function runMvpConversationTurn(
  conversationId: string,
  inboundMessageId: string,
  dependencies: { store: MvpTurnStore; provider: MvpAiTurnProvider },
): Promise<MvpTurnRunResult> {
  const acquired = acquiredSchema.parse(await dependencies.store.acquire(uuid.parse(conversationId), uuid.parse(inboundMessageId)));
  if (acquired.status === "not_applicable") return { status: "not_applicable" };
  if (acquired.status === "invalid_message") throw new MvpConversationTurnError("mvp_turn_invalid_message");
  if (acquired.status === "busy" || acquired.status === "completed") return { status: "duplicate" };

  const persistedFacts = await getProjectFacts(dependencies.store, acquired.turn.project_id);
  const input: MvpAiTurnInput = mvpAiTurnInputSchema.parse({
    turn: acquired.turn, project: acquired.project, persisted_facts: persistedFacts,
    inbound: acquired.inbound, transcript: acquired.transcript, ready_media: acquired.ready_media,
  });
  let untrusted: unknown;
  try { untrusted = await dependencies.provider.generateTurn(input); }
  catch (error) {
    await dependencies.store.fail(acquired.turn_id, "provider_failure");
    throw new MvpConversationTurnError("mvp_turn_provider_failed", { cause: error });
  }
  const validated = mvpAiTurnResultSchema.safeParse(untrusted);
  if (!validated.success) {
    await dependencies.store.fail(acquired.turn_id, "invalid_provider_output");
    throw new MvpConversationTurnError("mvp_turn_invalid_provider_output", { cause: validated.error });
  }
  try {
    const committed = committedSchema.parse(await dependencies.store.commit(acquired.turn_id, validated.data));
    if (committed.status === "stale") throw new MvpConversationTurnError("mvp_turn_stale");
    return { status: "completed", outbound_message_id: committed.outbound_message_id, turn: validated.data };
  } catch (error) {
    await dependencies.store.fail(acquired.turn_id, "commit_failed");
    if (error instanceof MvpConversationTurnError) throw error;
    throw new MvpConversationTurnError("mvp_turn_commit_failed", { cause: error });
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new MvpConversationTurnError("mvp_turn_configuration_failed");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export function createProductiveMvpTurnStore(): MvpTurnStore {
  const client = serviceClient();
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args); if (error) throw new MvpConversationTurnError("mvp_turn_persistence_failed"); return data;
  };
  return {
    rpc: (name, args) => client.rpc(name, args),
    acquire: (conversationId, inboundMessageId) => call("acquire_mvp_ai_turn", { target_conversation_id: conversationId, target_inbound_message_id: inboundMessageId }),
    commit: (turnId, result) => call("commit_mvp_ai_turn", { target_turn_id: turnId, target_facts_patch: result.facts_patch,
      target_reply_text: result.reply_text, target_qualification_status: result.qualification_status,
      target_needs_human: result.needs_human, target_human_reason: result.human_reason }),
    fail: async (turnId, code) => { await call("fail_mvp_ai_turn", { target_turn_id: turnId, target_failure_code: code }); },
  };
}

export async function runProductiveMvpConversationTurn(conversationId: string, inboundMessageId: string) {
  return runMvpConversationTurn(conversationId, inboundMessageId, { store: createProductiveMvpTurnStore(), provider: new OpenAiMvpTurnProvider() });
}
