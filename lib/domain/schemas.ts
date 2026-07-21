import { z } from "zod";
import { DEFAULT_REQUIRES_HUMAN_REVIEW, PROJECT_CLASSES, PROJECT_STATUSES, ROLES } from "./types";

export const roleSchema = z.enum(ROLES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectClassSchema = z.enum(PROJECT_CLASSES);
export const nullableProjectClassSchema = projectClassSchema.nullable();
export const requiresHumanReviewSchema = z.boolean().default(DEFAULT_REQUIRES_HUMAN_REVIEW);

const optionalText = z.string().trim().max(500).optional().nullable().transform((value) => value === "" ? null : value);

export const customerSchema = z.object({ first_name: z.string().trim().min(1, "Vorname ist erforderlich").max(120), last_name: z.string().trim().min(1, "Nachname ist erforderlich").max(120), email: z.string().trim().email().optional().or(z.literal("")).transform((value) => value || null), phone: optionalText });
export const projectSchema = z.object({ customer_id: z.string().uuid(), title: z.string().trim().min(1).max(180), status: projectStatusSchema.default("new"), project_class: nullableProjectClassSchema.optional(), installation_address: optionalText, postal_code: optionalText, city: optionalText, summary: z.string().trim().max(4000).optional().nullable().transform((value) => value === "" ? null : value), requires_human_review: requiresHumanReviewSchema });
export const projectNoteSchema = z.object({ project_id: z.string().uuid(), content: z.string().trim().min(1).max(4000) });
export type CustomerInput = z.infer<typeof customerSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
