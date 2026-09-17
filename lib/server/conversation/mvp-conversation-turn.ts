import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { mvpAiTurnInputObjectSchema, mvpAiTurnInputSchema, mvpAiTurnResultSchema, mvpQualificationStatusSchema, type MvpAiTurnInput, type MvpAiTurnResult } from "@/lib/domain/mvp-ai-turn";
import { MVP_PROJECT_FACT_KEYS, mvpProjectFactKeySchema } from "@/lib/domain/mvp-project-facts";
import { MVP_REQUIRED_PHOTO_CATEGORIES } from "@/lib/domain/mvp-project-facts";
import { deriveMissingMvpPhotoCategories, type MvpPhotoCategory } from "@/lib/domain/mvp-photo-policy";
import { deriveMissingMvpRequiredFacts, evaluateMvpQualificationReadiness } from "@/lib/domain/mvp-qualification-readiness";
import type { MvpAiTurnProvider } from "@/lib/server/ai/mvp-turn-provider";
import { OpenAiMvpTurnProvider } from "@/lib/server/ai/providers/openai/mvp-turn-adapter";
import { getProjectFacts, type ProjectFactsRpc } from "@/lib/server/project-facts/project-facts";

const uuid = z.string().uuid();
const acquiredMediaSchema = z.object({ media_id: uuid, category: mvpAiTurnInputObjectSchema.shape.ready_media.element.shape.category,
  mime_type: mvpAiTurnInputObjectSchema.shape.ready_media.element.shape.mime_type,
  caption: mvpAiTurnInputObjectSchema.shape.ready_media.element.shape.caption,
  storage_bucket: z.literal("project-media"), storage_path: z.string().min(1).max(1_024),
  file_size_bytes: z.number().int().positive().max(15_000_000) }).strict();
const acquiredSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("acquired"), turn_id: uuid, turn: mvpAiTurnInputObjectSchema.shape.turn,
    project: mvpAiTurnInputObjectSchema.shape.project, customer: mvpAiTurnInputObjectSchema.shape.customer,
    inbound: mvpAiTurnInputObjectSchema.shape.inbound,
    transcript: mvpAiTurnInputObjectSchema.shape.transcript, ready_media: z.array(acquiredMediaSchema).max(20),
    project_photo_coverage: mvpAiTurnInputObjectSchema.shape.project_photo_coverage }).strict(),
  z.object({ status: z.literal("busy"), turn_id: uuid, outbound_message_id: uuid.nullable() }).strict(),
  z.object({ status: z.literal("completed"), turn_id: uuid, outbound_message_id: uuid.nullable() }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
  z.object({ status: z.literal("invalid_message") }).strict(),
]);
const completedCommitBase = { status: z.literal("completed"), outbound_message_id: uuid } as const;
const committedSchema = z.union([
  z.object(completedCommitBase).strict(),
  z.object({
    ...completedCommitBase,
    qualification_status: mvpQualificationStatusSchema,
    handoff: z.enum(["none", "technical_review", "human_review_required", "missing_facts", "missing_evidence"]),
    missing_facts: z.array(mvpProjectFactKeySchema).max(MVP_PROJECT_FACT_KEYS.length),
    missing_photos: z.array(z.enum(MVP_REQUIRED_PHOTO_CATEGORIES)).max(6).default([]),
  }).strict(),
  z.object({ status: z.literal("stale") }).strict(),
]);

export type MvpTurnStore = ProjectFactsRpc & {
  acquire(conversationId: string, inboundMessageId: string): Promise<unknown>;
  commit(turnId: string, result: MvpAiTurnResult): Promise<unknown>;
  fail(turnId: string, code: "provider_failure" | "invalid_provider_output" | "commit_failed"): Promise<void>;
  loadMedia(bucket: string, path: string): Promise<Uint8Array>;
  revalidate(turnId: string): Promise<boolean>;
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
  const readyMedia = await Promise.all(acquired.ready_media.map(async (media) => {
    const bytes = await dependencies.store.loadMedia(media.storage_bucket, media.storage_path);
    if (bytes.byteLength !== media.file_size_bytes) throw new MvpConversationTurnError("mvp_turn_media_invalid");
    return { media_id: media.media_id, category: media.category, mime_type: media.mime_type,
      caption: media.caption, image_data: `data:${media.mime_type};base64,${Buffer.from(bytes).toString("base64")}` };
  }));
  if (!await dependencies.store.revalidate(acquired.turn_id)) {
    await dependencies.store.fail(acquired.turn_id, "commit_failed");
    throw new MvpConversationTurnError("mvp_turn_stale");
  }
  const input: MvpAiTurnInput = mvpAiTurnInputSchema.parse({
    turn: acquired.turn, project: acquired.project, customer: acquired.customer, persisted_facts: persistedFacts,
    inbound: acquired.inbound, transcript: acquired.transcript, ready_media: readyMedia, project_photo_coverage: acquired.project_photo_coverage,
    qualification_context: (() => {
      const covered = acquired.project_photo_coverage.map(({ category }) => category as MvpPhotoCategory);
      const photos = deriveMissingMvpPhotoCategories(persistedFacts, covered);
      return {
        collection_active: acquired.project.status !== "human_review" && acquired.project.requires_human_review !== true,
        missing_facts: deriveMissingMvpRequiredFacts(persistedFacts),
        missing_photos: [...photos.missingCore, ...photos.missingSituational],
        requires_site_check: evaluateMvpQualificationReadiness(persistedFacts).requiresSiteCheck,
      };
    })(),
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
  const currentMediaIds = new Set(input.ready_media.map(({ media_id }) => media_id));
  if (validated.data.media_classifications.some(({ media_id }) => !currentMediaIds.has(media_id))) {
    await dependencies.store.fail(acquired.turn_id, "invalid_provider_output");
    throw new MvpConversationTurnError("mvp_turn_invalid_provider_output");
  }
  const classifiedMediaIds = new Set(validated.data.media_classifications.map(({ media_id }) => media_id));
  const reconciled: MvpAiTurnResult = {
    ...validated.data,
    media_classifications: [
      ...validated.data.media_classifications,
      ...input.ready_media
        .filter(({ media_id }) => !classifiedMediaIds.has(media_id))
        .map(({ media_id }) => ({ media_id, category: "other" as const, observation: null })),
    ],
  };
  try {
    const committed = committedSchema.parse(await dependencies.store.commit(acquired.turn_id, reconciled));
    if (committed.status === "stale") throw new MvpConversationTurnError("mvp_turn_stale");
    return { status: "completed", outbound_message_id: committed.outbound_message_id, turn: reconciled };
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
      target_customer_name_patch: result.customer_name_patch,
      target_media_classifications: result.media_classifications,
      target_reply_text: result.reply_text, target_qualification_status: result.qualification_status,
      target_needs_human: result.needs_human, target_human_reason: result.human_reason }),
    fail: async (turnId, code) => { await call("fail_mvp_ai_turn", { target_turn_id: turnId, target_failure_code: code }); },
    loadMedia: async (bucket, path) => { const { data, error } = await client.storage.from(bucket).download(path); if (error) throw new MvpConversationTurnError("mvp_turn_media_unavailable"); return new Uint8Array(await data.arrayBuffer()); },
    revalidate: async (turnId) => { const value = await call("revalidate_mvp_ai_turn", { target_turn_id: turnId }); return value === true; },
  };
}

export async function runProductiveMvpConversationTurn(conversationId: string, inboundMessageId: string) {
  return runMvpConversationTurn(conversationId, inboundMessageId, { store: createProductiveMvpTurnStore(), provider: new OpenAiMvpTurnProvider() });
}
