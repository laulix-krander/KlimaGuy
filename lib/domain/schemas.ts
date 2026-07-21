import { z } from "zod";
import { projectClasses, projectStatuses, roles } from "./types";

export const roleSchema = z.enum(roles);
export const projectStatusSchema = z.enum(projectStatuses);
export const projectClassSchema = z.enum(projectClasses);

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => (value === "" || value === undefined ? null : value));

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value === "" || value === undefined ? null : value))
  .pipe(z.string().email("Bitte eine gültige E-Mail-Adresse eingeben.").nullable());

export const customerSchema = z.object({
  first_name: z.string().trim().min(1, "Vorname ist erforderlich.").max(120),
  last_name: z.string().trim().min(1, "Nachname ist erforderlich.").max(120),
  email: optionalEmail,
  phone: optionalText,
});

const nullableProjectClass = z
  .union([projectClassSchema, z.literal(""), z.null(), z.undefined()])
  .transform((value) => (value === "" || value === undefined ? null : value));

export const projectSchema = z.object({
  customer_id: z.string().uuid("Bitte einen Kunden auswählen."),
  title: z.string().trim().min(1, "Titel ist erforderlich.").max(180),
  status: projectStatusSchema.default("new"),
  project_class: nullableProjectClass,
  installation_address: optionalText,
  postal_code: optionalText,
  city: optionalText,
  summary: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .nullable()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  requires_human_review: z.coerce.boolean().default(true),
});

export const reviewerProjectUpdateSchema = z.object({
  status: projectStatusSchema,
  project_class: nullableProjectClass,
  summary: z.string().trim().max(4000).optional().nullable().transform((value) => (value === "" || value === undefined ? null : value)),
  requires_human_review: z.coerce.boolean(),
});

export const projectNoteSchema = z.object({
  project_id: z.string().uuid(),
  content: z.string().trim().min(1, "Notiz darf nicht leer sein.").max(4000),
});

export const noteUpdateSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  content: z.string().trim().min(1, "Notiz darf nicht leer sein.").max(4000),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type ReviewerProjectUpdateInput = z.infer<typeof reviewerProjectUpdateSchema>;
