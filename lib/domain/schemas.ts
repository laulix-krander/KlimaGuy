import { z } from "zod";
import { DEFAULT_REQUIRES_HUMAN_REVIEW, PROJECT_CLASSES, PROJECT_STATUSES, ROLES } from "./types";

export const roleSchema = z.enum(ROLES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectClassSchema = z.enum(PROJECT_CLASSES);
export const nullableProjectClassSchema = projectClassSchema.nullable();
export const requiresHumanReviewSchema = z.boolean().default(DEFAULT_REQUIRES_HUMAN_REVIEW);

const optionalText = z.string().trim().max(500).optional().nullable().transform((value) => value === "" ? null : value);
const optionalEmail = z.string().trim().email("Bitte geben Sie eine gültige E-Mail-Adresse ein.").optional().or(z.literal("")).transform((value) => value || null);
const optionalCustomerText = z.string().trim().max(500).optional().nullable().transform((value) => value ? value : null);
const optionalProjectSummary = z.string().trim().max(4000).optional().nullable().transform((value) => value ? value : null);

const customerFields = {
  first_name: z.string().trim().min(1, "Vorname ist erforderlich").max(120),
  last_name: z.string().trim().min(1, "Nachname ist erforderlich").max(120),
  email: optionalEmail,
  phone: optionalCustomerText,
};

export const createCustomerSchema = z.object(customerFields).strip();
export const updateCustomerSchema = z.object(customerFields).strip();
export const customerSchema = createCustomerSchema;

export const projectIdSchema = z.string().uuid("Die Projekt-ID ist ungültig.");
export const projectNoteIdSchema = z.string().uuid("Die Notiz-ID ist ungültig.");

export const PROJECT_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const PROJECT_MEDIA_CATEGORIES = [
  "indoor_area", "outdoor_area", "indoor_unit_location", "outdoor_unit_location",
  "pipe_route", "electrical_connection", "condensate_route", "facade", "roof",
  "balcony", "floor_plan", "technical_document", "customer_document", "other",
] as const;

const uploadFilenameSchema = z.string().trim()
  .min(1, "Der Dateiname ist erforderlich.")
  .max(255, "Der Dateiname darf höchstens 255 Zeichen lang sein.")
  .refine((value) => value !== "." && value !== "..", "Der Dateiname ist ungültig.")
  .refine((value) => !/[\\/\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value), "Der Dateiname ist ungültig.")
  .transform((value) => value.normalize("NFC"));

export const uploadReservationSchema = z.object({
  project_id: projectIdSchema,
  original_filename: uploadFilenameSchema,
  mime_type: z.enum(PROJECT_MEDIA_MIME_TYPES),
  file_size_bytes: z.number().int().positive("Die Datei darf nicht leer sein."),
  category: z.enum(PROJECT_MEDIA_CATEGORIES),
  source: z.literal("manual_upload"),
}).strip().superRefine((value, context) => {
  const max = value.mime_type === "application/pdf" ? 25_000_000 : 15_000_000;
  if (value.file_size_bytes > max) context.addIssue({ code: z.ZodIssueCode.too_big, maximum: max, type: "number", inclusive: true, path: ["file_size_bytes"], message: `Die Datei darf höchstens ${max} Bytes groß sein.` });
});

export const uploadReservedProjectMediaSchema = z.object({
  media_id: z.string().uuid("Die Medien-ID ist ungültig."),
  project_id: projectIdSchema,
  file: z.unknown(),
}).strict();

export const finalizeProjectMediaUploadSchema = z.object({
  media_id: z.string().uuid("Die Medien-ID ist ungültig."),
  project_id: projectIdSchema,
}).strict();

export const createProjectMediaSignedViewUrlSchema = z.object({
  project_id: projectIdSchema,
  media_id: z.string().uuid("Die Medien-ID ist ungültig."),
}).strict();

export const projectMediaOrphanInventoryQuerySchema = z.object({
  status: z.enum(["all", "pending", "failed"]).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
}).strict();

export const userAdministrationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

export const changeUserRoleSchema = z.object({
  target_user_id: z.string().uuid("Die Benutzer-ID ist ungültig."),
  target_role: roleSchema,
  expected_current_role: roleSchema,
}).strict();

export const inviteReviewerSchema = z.object({
  email: z.string().trim().min(1).max(254).email(),
}).strict();

export const projectMediaOrphanClaimSchema = z.object({
  media_id: z.string().uuid("Die Medien-ID ist ungültig."),
  project_id: projectIdSchema,
}).strict();

export const projectMediaStoragePurgeSchema = z.object({
  media_id: z.string().uuid("Die Medien-ID ist ungültig."),
  project_id: projectIdSchema,
}).strict();

export const projectMediaGalleryRowSchema = z.object({
  id: z.string().uuid(),
  project_id: projectIdSchema,
  category: z.enum(PROJECT_MEDIA_CATEGORIES),
  media_type: z.enum(["image", "document"]),
  mime_type: z.enum(PROJECT_MEDIA_MIME_TYPES),
  file_size_bytes: z.number().int().positive(),
  caption: z.string().max(1000).nullable(),
  created_at: z.string().datetime({ offset: true }),
  storage_bucket: z.literal("project-media"),
  storage_path: z.string().min(1),
}).strict().superRefine((value, context) => {
  const expectedType = value.mime_type === "application/pdf" ? "document" : "image";
  if (value.media_type !== expectedType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["media_type"], message: "Medientyp und MIME-Typ stimmen nicht überein." });
  }
});

const projectCoreFields = {
  title: z.string().trim().min(1, "Projektbezeichnung ist erforderlich").max(180),
  installation_address: optionalText,
  postal_code: optionalText,
  city: optionalText,
  summary: optionalProjectSummary,
};

export const createProjectSchema = z.object({
  customer_id: z.string().uuid("Die Kunden-ID ist ungültig."),
  title: projectCoreFields.title,
  summary: projectCoreFields.summary,
}).strip();

export const updateProjectCoreSchema = z.object(projectCoreFields).strip();

export const updateProjectMetadataSchema = z.object({
  title: projectCoreFields.title,
  installation_address: projectCoreFields.installation_address,
  postal_code: projectCoreFields.postal_code,
  city: projectCoreFields.city,
}).strip();

export const updateProjectStatusSchema = z.object({
  status: projectStatusSchema,
}).strip();

export const updateProjectClassSchema = z.object({
  project_class: projectClassSchema,
}).strip();

export const updateProjectSummarySchema = z.object({
  summary: projectCoreFields.summary,
}).strip();

export const updateProjectHumanReviewSchema = z.object({
  requires_human_review: z.boolean(),
}).strip();


export const projectSchema = createProjectSchema.extend({
  status: projectStatusSchema.default(PROJECT_STATUSES[0]),
  project_class: nullableProjectClassSchema.optional(),
  installation_address: optionalText,
  postal_code: optionalText,
  city: optionalText,
  requires_human_review: requiresHumanReviewSchema,
});
const projectNoteContentSchema = z.string().trim().min(1, "Notiz ist erforderlich.").max(4000, "Notiz darf höchstens 4000 Zeichen lang sein.");

export const projectNoteSchema = z.object({
  project_id: projectIdSchema,
  content: projectNoteContentSchema,
}).strip();

export const updateProjectNoteSchema = z.object({
  note_id: projectNoteIdSchema,
  project_id: projectIdSchema,
  content: projectNoteContentSchema,
}).strip();

export const deleteProjectNoteSchema = z.object({
  note_id: projectNoteIdSchema,
  project_id: projectIdSchema,
}).strip();
export type CustomerInput = z.infer<typeof createCustomerSchema>;
export type ProjectInput = z.infer<typeof createProjectSchema>;
export type ProjectCoreUpdateInput = z.infer<typeof updateProjectCoreSchema>;
export type ProjectMetadataUpdateInput = z.infer<typeof updateProjectMetadataSchema>;
export type ProjectStatusUpdateInput = z.infer<typeof updateProjectStatusSchema>;
export type ProjectClassUpdateInput = z.infer<typeof updateProjectClassSchema>;
export type ProjectSummaryUpdateInput = z.infer<typeof updateProjectSummarySchema>;
export type ProjectHumanReviewUpdateInput = z.infer<typeof updateProjectHumanReviewSchema>;
export type ProjectNoteInput = z.infer<typeof projectNoteSchema>;
export type ProjectNoteUpdateInput = z.infer<typeof updateProjectNoteSchema>;
export type ProjectNoteDeleteInput = z.infer<typeof deleteProjectNoteSchema>;
export type UploadReservationInput = z.infer<typeof uploadReservationSchema>;
export type UploadReservedProjectMediaInput = z.infer<typeof uploadReservedProjectMediaSchema>;
export type FinalizeProjectMediaUploadInput = z.infer<typeof finalizeProjectMediaUploadSchema>;
