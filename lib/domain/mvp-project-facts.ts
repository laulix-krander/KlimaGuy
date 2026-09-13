import { z } from "zod";

export const MVP_BUILDING_TYPES = [
  "apartment",
  "single_family_house",
  "multi_family_house",
  "other",
] as const;

export const MVP_ROOM_TYPES = [
  "living_room",
  "bedroom",
  "office",
  "kitchen",
  "other",
] as const;

export const MVP_TECHNICAL_SITUATIONS = [
  "available",
  "not_available",
  "unknown",
  "requires_site_check",
] as const;

export const MVP_INSTALLATION_ACCESS = [
  "standard_ladder",
  "special_access_required",
  "unknown",
] as const;

export const MVP_REQUIRED_PHOTO_CATEGORIES = [
  "room_overview",
  "indoor_unit_location",
  "outdoor_unit_location",
  "pipe_route",
  "electrical_connection",
  "condensate_route",
] as const;

const shortText = z.string().trim().min(1).max(240);
const noteText = z.string().trim().min(1).max(1_000);

/**
 * The finite MVP vocabulary. Values are deliberately individual schemas rather
 * than arbitrary JSON so untrusted AI output cannot introduce new fact shapes.
 */
export const MVP_PROJECT_FACT_SCHEMAS = {
  installation_address: z.string().trim().min(3).max(240),
  postal_code: z.string().trim().regex(/^\d{5}$/u),
  city: z.string().trim().min(2).max(120),
  building_type: z.enum(MVP_BUILDING_TYPES),
  floor_level: z.number().int().min(-2).max(100),
  requested_room_count: z.number().int().min(1).max(20),
  room_type: z.enum(MVP_ROOM_TYPES),
  room_area_sqm: z.number().finite().min(5).max(500),
  indoor_unit_count: z.number().int().min(1).max(20),
  indoor_unit_position: shortText,
  outdoor_unit_position: shortText,
  line_route: shortText,
  estimated_line_length_m: z.number().finite().min(0).max(200),
  core_drilling_count: z.number().int().min(0).max(20),
  condensate_drainage: z.enum(MVP_TECHNICAL_SITUATIONS),
  electrical_supply: z.enum(MVP_TECHNICAL_SITUATIONS),
  installation_access: z.enum(MVP_INSTALLATION_ACCESS),
  existing_air_conditioning: z.boolean(),
  customer_preferences: noteText,
  required_photo_categories: z.array(z.enum(MVP_REQUIRED_PHOTO_CATEGORIES)).max(MVP_REQUIRED_PHOTO_CATEGORIES.length),
  additional_installation_notes: noteText,
} as const;

export const MVP_PROJECT_FACT_KEYS = Object.freeze(
  Object.keys(MVP_PROJECT_FACT_SCHEMAS) as MvpProjectFactKey[],
);

export type MvpProjectFactKey = keyof typeof MVP_PROJECT_FACT_SCHEMAS;

type FactFor<Key extends MvpProjectFactKey> = Readonly<{
  key: Key;
  value: z.infer<(typeof MVP_PROJECT_FACT_SCHEMAS)[Key]>;
}>;

export type MvpProjectFact = {
  [Key in MvpProjectFactKey]: FactFor<Key>;
}[MvpProjectFactKey];

export const mvpProjectFactKeySchema = z.enum(
  MVP_PROJECT_FACT_KEYS as [MvpProjectFactKey, ...MvpProjectFactKey[]],
);

export const mvpProjectFactSchema: z.ZodType<MvpProjectFact, z.ZodTypeDef, unknown> = z.object({
  key: mvpProjectFactKeySchema,
  value: z.unknown(),
}).strict().superRefine((fact, context) => {
  const parsedValue = MVP_PROJECT_FACT_SCHEMAS[fact.key].safeParse(fact.value);
  if (!parsedValue.success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "fact_value_invalid",
    });
  }
}).transform((fact) => ({
  key: fact.key,
  value: MVP_PROJECT_FACT_SCHEMAS[fact.key].parse(fact.value),
}) as MvpProjectFact);
