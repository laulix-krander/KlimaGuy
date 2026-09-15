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

const shortText = z.string().trim().min(1).max(240);
const noteText = z.string().trim().min(1).max(1_000);

/** OpenAI-safe mirror of every representable canonical fact constraint. */
export const mvpOpenAiFactSchema = z.discriminatedUnion("key", [
  fact("installation_address", z.string().trim().min(3).max(240)),
  fact("postal_code", z.string().trim().regex(/^\d{5}$/u)),
  fact("city", z.string().trim().min(2).max(120)),
  fact("building_type", z.enum(MVP_BUILDING_TYPES)),
  fact("floor_level", z.number().int().min(-2).max(100)),
  fact("requested_room_count", z.number().int().min(1).max(20)),
  fact("room_type", z.enum(MVP_ROOM_TYPES)),
  fact("room_area_sqm", z.number().finite().min(5).max(500)),
  fact("indoor_unit_count", z.number().int().min(1).max(20)),
  fact("indoor_unit_position", shortText),
  fact("outdoor_unit_position", shortText),
  fact("line_route", shortText),
  fact("estimated_line_length_m", z.number().finite().min(0).max(200)),
  fact("core_drilling_count", z.number().int().min(0).max(20)),
  fact("condensate_drainage", z.enum(MVP_TECHNICAL_SITUATIONS)),
  fact("electrical_supply", z.enum(MVP_TECHNICAL_SITUATIONS)),
  fact("installation_access", z.enum(MVP_INSTALLATION_ACCESS)),
  fact("existing_air_conditioning", z.boolean()),
  fact("customer_preferences", noteText),
  fact("additional_installation_notes", noteText),
]);

const customerNamePatchSchema = z.union([
  z.object({ first_name: z.string().trim().min(1).max(120), last_name: z.string().trim().min(1).max(120).nullable() }).strict(),
  z.object({ first_name: z.null(), last_name: z.string().trim().min(1).max(120) }).strict(),
]).nullable();

const turnFields = {
  reply_text: z.string().min(1).max(4_000),
  facts_patch: z.array(mvpOpenAiFactSchema).max(MVP_PROJECT_FACT_KEYS.length),
  customer_name_patch: customerNamePatchSchema,
  media_classifications: z.array(z.object({
    media_id: z.string().uuid(), category: z.enum(MVP_REQUIRED_PHOTO_CATEGORIES).nullable(),
    observation: z.string().trim().min(1).max(240).nullable(),
  }).strict()).max(20),
} as const;

export const mvpOpenAiTurnOutputSchema = z.object({
  ...turnFields,
  qualification_status: z.enum(MVP_QUALIFICATION_STATUSES),
  needs_human: z.boolean(),
  human_reason: z.enum(MVP_HUMAN_ESCALATION_REASONS).nullable(),
}).strict();
