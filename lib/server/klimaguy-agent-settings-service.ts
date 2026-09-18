import "server-only";

import { z } from "zod";
import { DEFAULT_KLIMAGUY_AGENT_SETTINGS, defaultEffectiveKlimaGuyAgentSettings, klimaguyAgentSettingsRowSchema, klimaguyAgentSettingsSchema, type EffectiveKlimaGuyAgentSettings, type KlimaGuyAgentSettings } from "@/lib/domain/klimaguy-agent-settings";

export type KlimaGuySettingsDataSource = {
  read(): Promise<unknown | null>;
  update(args: Record<string, unknown>): Promise<unknown>;
};
const updateResultSchema = z.object({ status: z.literal("updated"), revision: z.number().int().positive(), updated_at: z.string().datetime() }).strict();

export class KlimaGuySettingsConflictError extends Error { constructor() { super("klimaguy_settings_stale"); this.name = "KlimaGuySettingsConflictError"; } }
export class KlimaGuySettingsServiceError extends Error { constructor(message = "klimaguy_settings_failed", options?: ErrorOptions) { super(message, options); this.name = "KlimaGuySettingsServiceError"; } }

export async function loadEffectiveKlimaGuySettings(source: Pick<KlimaGuySettingsDataSource, "read">): Promise<EffectiveKlimaGuyAgentSettings> {
  const raw = await source.read();
  if (raw === null) return defaultEffectiveKlimaGuyAgentSettings();
  const row = klimaguyAgentSettingsRowSchema.parse(raw);
  const { id: _id, revision, updated_by: _updatedBy, created_at: _createdAt, updated_at, ...settings } = row;
  return { settings: klimaguyAgentSettingsSchema.parse(settings), revision, persisted: true, updatedAt: updated_at };
}

export async function loadRuntimeKlimaGuySettings(source: Pick<KlimaGuySettingsDataSource, "read">): Promise<KlimaGuyAgentSettings> {
  try { return (await loadEffectiveKlimaGuySettings(source)).settings; }
  catch { return { ...DEFAULT_KLIMAGUY_AGENT_SETTINGS }; }
}

export async function updateKlimaGuySettings(source: Pick<KlimaGuySettingsDataSource, "update">, settings: KlimaGuyAgentSettings, expectedRevision: number) {
  const valid = klimaguyAgentSettingsSchema.parse(settings);
  try {
    return updateResultSchema.parse(await source.update({
      target_communication_formality: valid.communication_formality, target_tone: valid.tone,
      target_response_length: valid.response_length, target_emoji_usage: valid.emoji_usage,
      target_acknowledge_answers: valid.acknowledge_answers, target_question_strategy: valid.question_strategy,
      target_greeting_style: valid.greeting_style, target_closing_style: valid.closing_style,
      target_ask_customer_name: valid.ask_customer_name, target_customer_name_timing: valid.customer_name_timing,
      target_use_customer_name: valid.use_customer_name, target_photo_request_strategy: valid.photo_request_strategy,
      target_unknown_answer_behavior: valid.unknown_answer_behavior, target_site_visit_policy: valid.site_visit_policy,
      target_expected_revision: z.number().int().nonnegative().parse(expectedRevision),
    }));
  } catch (error) {
    if (error instanceof Error && (error.message.includes("klimaguy_settings_stale") || ("code" in error && error.code === "40001"))) throw new KlimaGuySettingsConflictError();
    throw new KlimaGuySettingsServiceError("klimaguy_settings_update_failed", { cause: error });
  }
}
