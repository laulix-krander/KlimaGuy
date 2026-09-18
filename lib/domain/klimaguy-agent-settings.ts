import { z } from "zod";

export const KLIMAGUY_AGENT_SETTINGS_ID = "00000000-0000-4000-8000-000000000404" as const;
export const COMMUNICATION_FORMALITIES = ["formal", "informal"] as const;
export const TONES = ["professional", "friendly", "relaxed"] as const;
export const RESPONSE_LENGTHS = ["short", "balanced"] as const;
export const EMOJI_USAGES = ["none", "sparse"] as const;
export const QUESTION_STRATEGIES = ["one_at_a_time", "group_compatible"] as const;
export const GREETING_STYLES = ["concise", "warm"] as const;
export const CLOSING_STYLES = ["concise", "warm"] as const;
export const CUSTOMER_NAME_TIMINGS = ["early", "after_context"] as const;
export const PHOTO_REQUEST_STRATEGIES = ["grouped", "sequential"] as const;
export const UNKNOWN_ANSWER_BEHAVIORS = ["mark_unknown_and_continue", "escalate_when_critical"] as const;
export const SITE_VISIT_POLICIES = ["recommend_on_required_site_check", "human_decides"] as const;

export const klimaguyAgentSettingsSchema = z.object({
  communication_formality: z.enum(COMMUNICATION_FORMALITIES), tone: z.enum(TONES),
  response_length: z.enum(RESPONSE_LENGTHS), emoji_usage: z.enum(EMOJI_USAGES),
  acknowledge_answers: z.boolean(), question_strategy: z.enum(QUESTION_STRATEGIES),
  greeting_style: z.enum(GREETING_STYLES), closing_style: z.enum(CLOSING_STYLES),
  ask_customer_name: z.boolean(), customer_name_timing: z.enum(CUSTOMER_NAME_TIMINGS),
  use_customer_name: z.boolean(), photo_request_strategy: z.enum(PHOTO_REQUEST_STRATEGIES),
  unknown_answer_behavior: z.enum(UNKNOWN_ANSWER_BEHAVIORS), site_visit_policy: z.enum(SITE_VISIT_POLICIES),
}).strict();
export type KlimaGuyAgentSettings = z.infer<typeof klimaguyAgentSettingsSchema>;

export const DEFAULT_KLIMAGUY_AGENT_SETTINGS: Readonly<KlimaGuyAgentSettings> = Object.freeze({
  communication_formality: "informal", tone: "friendly", response_length: "short", emoji_usage: "none",
  acknowledge_answers: true, question_strategy: "group_compatible", greeting_style: "warm", closing_style: "warm",
  ask_customer_name: true, customer_name_timing: "early", use_customer_name: true,
  photo_request_strategy: "grouped", unknown_answer_behavior: "mark_unknown_and_continue",
  site_visit_policy: "recommend_on_required_site_check",
});

export const klimaguyAgentSettingsRowSchema = klimaguyAgentSettingsSchema.extend({
  id: z.literal(KLIMAGUY_AGENT_SETTINGS_ID), revision: z.number().int().positive(),
  updated_by: z.string().uuid().nullable(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict();

export const KLIMAGUY_SETTINGS_OPTIONS = {
  communication_formality: [{ value: "formal", label: "Sie – professionell" }, { value: "informal", label: "Du – persönlich" }],
  tone: [{ value: "professional", label: "Professionell" }, { value: "friendly", label: "Freundlich & nahbar" }, { value: "relaxed", label: "Locker" }],
  response_length: [{ value: "short", label: "Kurz" }, { value: "balanced", label: "Ausgewogen" }],
  emoji_usage: [{ value: "none", label: "Keine" }, { value: "sparse", label: "Sparsam" }],
  question_strategy: [{ value: "one_at_a_time", label: "Eine Frage nach der anderen" }, { value: "group_compatible", label: "Passende Fragen bündeln" }],
  greeting_style: [{ value: "concise", label: "Kurz & direkt" }, { value: "warm", label: "Persönlich & freundlich" }],
  closing_style: [{ value: "concise", label: "Kurz & direkt" }, { value: "warm", label: "Persönlich & freundlich" }],
  customer_name_timing: [{ value: "early", label: "Früh im Gespräch" }, { value: "after_context", label: "Nach erstem Projektkontext" }],
  photo_request_strategy: [{ value: "grouped", label: "Fotos gebündelt anfragen" }, { value: "sequential", label: "Fotos einzeln anfragen" }],
  unknown_answer_behavior: [{ value: "mark_unknown_and_continue", label: "Unklar markieren & weitermachen" }, { value: "escalate_when_critical", label: "Bei wichtigen Unklarheiten früher übergeben" }],
  site_visit_policy: [{ value: "recommend_on_required_site_check", label: "Vor-Ort-Prüfung bei Bedarf empfehlen" }, { value: "human_decides", label: "Übergabe an Team – Terminentscheidung menschlich" }],
} as const satisfies Record<string, readonly { value: string; label: string }[]>;

export type EffectiveKlimaGuyAgentSettings = Readonly<{ settings: KlimaGuyAgentSettings; revision: number; persisted: boolean; updatedAt: string | null }>;
export const defaultEffectiveKlimaGuyAgentSettings = (): EffectiveKlimaGuyAgentSettings => ({ settings: { ...DEFAULT_KLIMAGUY_AGENT_SETTINGS }, revision: 0, persisted: false, updatedAt: null });
