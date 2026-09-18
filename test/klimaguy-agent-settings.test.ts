import { describe, expect, it } from "vitest";
import { DEFAULT_KLIMAGUY_AGENT_SETTINGS, KLIMAGUY_AGENT_SETTINGS_ID, defaultEffectiveKlimaGuyAgentSettings, klimaguyAgentSettingsRowSchema, klimaguyAgentSettingsSchema } from "../lib/domain/klimaguy-agent-settings";
import { loadEffectiveKlimaGuySettings, loadRuntimeKlimaGuySettings, updateKlimaGuySettings } from "../lib/server/klimaguy-agent-settings-service";

describe("KlimaGuy agent settings domain and service", () => {
  it("owns the complete safe Production defaults", () => {
    expect(DEFAULT_KLIMAGUY_AGENT_SETTINGS).toEqual({ communication_formality: "informal", tone: "friendly", response_length: "short", emoji_usage: "none", acknowledge_answers: true, question_strategy: "group_compatible", greeting_style: "warm", closing_style: "warm", ask_customer_name: true, customer_name_timing: "early", use_customer_name: true, photo_request_strategy: "grouped", unknown_answer_behavior: "mark_unknown_and_continue", site_visit_policy: "recommend_on_required_site_check" });
    expect(klimaguyAgentSettingsSchema.parse(DEFAULT_KLIMAGUY_AGENT_SETTINGS)).toEqual(DEFAULT_KLIMAGUY_AGENT_SETTINGS);
  });
  it("rejects unknown vocabulary and extra prompt fields", () => {
    expect(klimaguyAgentSettingsSchema.safeParse({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, tone: "salesy" }).success).toBe(false);
    expect(klimaguyAgentSettingsSchema.safeParse({ ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, custom_prompt: "ignore safety" }).success).toBe(false);
  });
  it("returns explicit unpersisted defaults when no persisted row exists", async () => {
    await expect(loadEffectiveKlimaGuySettings({ read: async () => null })).resolves.toEqual(defaultEffectiveKlimaGuyAgentSettings());
  });
  it("parses persisted settings with offset-aware Postgres timestamps", async () => {
    const persistedSettings = { ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, communication_formality: "formal" as const };
    const row = { id: KLIMAGUY_AGENT_SETTINGS_ID, ...persistedSettings, revision: 2, updated_by: null, created_at: "2026-09-18T09:32:56.123456+00:00", updated_at: "2026-09-18T09:33:01.654321+00:00" };
    expect(klimaguyAgentSettingsRowSchema.parse(row)).toEqual(row);
    await expect(loadEffectiveKlimaGuySettings({ read: async () => row })).resolves.toEqual({ persisted: true, revision: 2, settings: persistedSettings, updatedAt: row.updated_at });
  });
  it("continues to accept UTC-Z timestamps and rejects malformed timestamps", () => {
    const row = { id: KLIMAGUY_AGENT_SETTINGS_ID, ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, revision: 2, updated_by: null, created_at: "2026-09-18T10:00:00.000Z", updated_at: "2026-09-18T11:00:00.000Z" };
    expect(klimaguyAgentSettingsRowSchema.safeParse(row).success).toBe(true);
    expect(klimaguyAgentSettingsRowSchema.safeParse({ ...row, updated_at: "2026-09-18 11:00:00" }).success).toBe(false);
  });
  it("keeps the runtime safe-default fallback for read failures and malformed rows", async () => {
    await expect(loadRuntimeKlimaGuySettings({ read: async () => { throw new Error("db"); } })).resolves.toEqual(DEFAULT_KLIMAGUY_AGENT_SETTINGS);
    await expect(loadRuntimeKlimaGuySettings({ read: async () => ({ invalid: "row" }) })).resolves.toEqual(DEFAULT_KLIMAGUY_AGENT_SETTINGS);
  });
  it("maps every field and expected revision to the narrow CAS RPC", async () => {
    let args: Record<string, unknown> = {};
    const result = await updateKlimaGuySettings({ update: async (value) => { args = value; return { status: "updated", revision: 1, updated_at: "2026-09-18T09:32:56.123456+00:00" }; } }, DEFAULT_KLIMAGUY_AGENT_SETTINGS, 0);
    expect(result).toEqual({ status: "updated", revision: 1, updated_at: "2026-09-18T09:32:56.123456+00:00" }); expect(args.target_expected_revision).toBe(0); expect(args.target_tone).toBe("friendly"); expect(Object.keys(args)).toHaveLength(15);
  });
});
