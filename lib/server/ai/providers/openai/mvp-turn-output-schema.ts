import { z } from "zod";
import {
  MVP_HUMAN_ESCALATION_REASONS,
  MVP_QUALIFICATION_STATUSES,
} from "@/lib/domain/mvp-ai-turn";
import {
  MVP_PROJECT_FACT_KEYS,
  MVP_REQUIRED_PHOTO_CATEGORIES,
} from "@/lib/domain/mvp-project-facts";

const providerFactValueSchema = z.union([
  z.string().max(1_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.enum(MVP_REQUIRED_PHOTO_CATEGORIES)).max(MVP_REQUIRED_PHOTO_CATEGORIES.length),
]);

/**
 * OpenAI-facing shape only. Its finite value union is representable by strict
 * Structured Outputs; the authoritative key/value relationship is validated
 * by mvpAiTurnResultSchema after the provider response is parsed.
 */
export const mvpOpenAiTurnOutputSchema = z.object({
  reply_text: z.string().min(1).max(4_000),
  facts_patch: z.array(z.object({
    key: z.enum(MVP_PROJECT_FACT_KEYS as [
      (typeof MVP_PROJECT_FACT_KEYS)[number],
      ...(typeof MVP_PROJECT_FACT_KEYS)[number][],
    ]),
    value: providerFactValueSchema,
  }).strict()).max(MVP_PROJECT_FACT_KEYS.length),
  missing_facts: z.array(z.enum(MVP_PROJECT_FACT_KEYS as [
    (typeof MVP_PROJECT_FACT_KEYS)[number],
    ...(typeof MVP_PROJECT_FACT_KEYS)[number][],
  ])).max(MVP_PROJECT_FACT_KEYS.length),
  qualification_status: z.enum(MVP_QUALIFICATION_STATUSES),
  needs_human: z.boolean(),
  human_reason: z.enum(MVP_HUMAN_ESCALATION_REASONS).nullable(),
}).strict();
