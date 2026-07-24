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

export const updateProjectReviewSchema = z.object({
  status: projectStatusSchema,
  project_class: projectClassSchema,
  requires_human_review: requiresHumanReviewSchema,
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
export type ProjectReviewUpdateInput = z.infer<typeof updateProjectReviewSchema>;
export type ProjectNoteInput = z.infer<typeof projectNoteSchema>;
export type ProjectNoteUpdateInput = z.infer<typeof updateProjectNoteSchema>;
export type ProjectNoteDeleteInput = z.infer<typeof deleteProjectNoteSchema>;
