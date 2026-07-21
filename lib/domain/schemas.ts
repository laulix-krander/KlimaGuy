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

const customerFields = {
  first_name: z.string().trim().min(1, "Vorname ist erforderlich").max(120),
  last_name: z.string().trim().min(1, "Nachname ist erforderlich").max(120),
  email: optionalEmail,
  phone: optionalCustomerText,
};

export const createCustomerSchema = z.object(customerFields).strip();
export const updateCustomerSchema = z.object(customerFields).strip();
export const customerSchema = createCustomerSchema;
export const projectSchema = z.object({ customer_id: z.string().uuid(), title: z.string().trim().min(1).max(180), status: projectStatusSchema.default("new"), project_class: nullableProjectClassSchema.optional(), installation_address: optionalText, postal_code: optionalText, city: optionalText, summary: z.string().trim().max(4000).optional().nullable().transform((value) => value === "" ? null : value), requires_human_review: requiresHumanReviewSchema });
export const projectNoteSchema = z.object({ project_id: z.string().uuid(), content: z.string().trim().min(1).max(4000) });
export type CustomerInput = z.infer<typeof createCustomerSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
