import { z } from "zod";
import {
  MVP_HUMAN_ESCALATION_REASONS,
  MVP_QUALIFICATION_STATUSES,
} from "@/lib/domain/mvp-ai-turn";
import {
  MVP_BUILDING_TYPES,
  MVP_INSTALLATION_ACCESS,
  MVP_PROJECT_FACT_KEYS,
  MVP_REQUIRED_PHOTO_CATEGORIES,
  MVP_ROOM_TYPES,
  MVP_TECHNICAL_SITUATIONS,
} from "@/lib/domain/mvp-project-facts";

const fact = <Key extends (typeof MVP_PROJECT_FACT_KEYS)[number], Value extends z.ZodTypeAny>(
  key: Key,
  value: Value,
) => z.object({ key: z.literal(key), value }).strict();

/**
 * OpenAI-facing fact contract. Each branch carries its canonical key/value
 * relationship in the generated Structured Output schema. Range, formatting,
 * and semantic validation remain the responsibility of the domain schema.
 */
export const mvpOpenAiFactSchema = z.discriminatedUnion("key", [
  fact("installation_address", z.string()),
  fact("postal_code", z.string()),
  fact("city", z.string()),
  fact("building_type", z.enum(MVP_BUILDING_TYPES)),
  fact("floor_level", z.number()),
  fact("requested_room_count", z.number()),
  fact("room_type", z.enum(MVP_ROOM_TYPES)),
  fact("room_area_sqm", z.number()),
  fact("indoor_unit_count", z.number()),
  fact("indoor_unit_position", z.string()),
  fact("outdoor_unit_position", z.string()),
  fact("line_route", z.string()),
  fact("estimated_line_length_m", z.number()),
  fact("core_drilling_count", z.number()),
  fact("condensate_drainage", z.enum(MVP_TECHNICAL_SITUATIONS)),
  fact("electrical_supply", z.enum(MVP_TECHNICAL_SITUATIONS)),
  fact("installation_access", z.enum(MVP_INSTALLATION_ACCESS)),
  fact("existing_air_conditioning", z.boolean()),
  fact("customer_preferences", z.string()),
  fact("required_photo_categories", z.array(z.enum(MVP_REQUIRED_PHOTO_CATEGORIES))),
  fact("additional_installation_notes", z.string()),
]);

export const mvpOpenAiTurnOutputSchema = z.object({
  reply_text: z.string().min(1).max(4_000),
  facts_patch: z.array(mvpOpenAiFactSchema).max(MVP_PROJECT_FACT_KEYS.length),
  missing_facts: z.array(z.enum(MVP_PROJECT_FACT_KEYS as [
    (typeof MVP_PROJECT_FACT_KEYS)[number],
    ...(typeof MVP_PROJECT_FACT_KEYS)[number][],
  ])).max(MVP_PROJECT_FACT_KEYS.length),
  qualification_status: z.enum(MVP_QUALIFICATION_STATUSES),
  needs_human: z.boolean(),
  human_reason: z.enum(MVP_HUMAN_ESCALATION_REASONS).nullable(),
  customer_name_patch: z.object({
    first_name: z.string().min(1).max(120).nullable(),
    last_name: z.string().min(1).max(120).nullable(),
  }).strict().nullable(),
}).strict();
