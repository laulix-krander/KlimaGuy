import { z } from "zod";
import { projectClasses, projectStatuses, roles } from "./types";

export const roleSchema = z.enum(roles);
export const projectStatusSchema = z.enum(projectStatuses);
export const projectClassSchema = z.enum(projectClasses);
const optionalText = z.string().trim().max(500).optional().nullable().transform((value) => value === "" ? null : value);
export const customerSchema = z.object({ first_name: z.string().trim().min(1, "Vorname ist erforderlich").max(120), last_name: z.string().trim().min(1, "Nachname ist erforderlich").max(120), email: z.string().trim().email().optional().or(z.literal("")).transform((value) => value || null), phone: optionalText });
export const projectSchema = z.object({ customer_id: z.string().uuid(), title: z.string().trim().min(1).max(180), status: projectStatusSchema.default("new"), project_class: projectClassSchema.nullable().optional(), installation_address: optionalText, postal_code: optionalText, city: optionalText, summary: z.string().trim().max(4000).optional().nullable().transform((value) => value === "" ? null : value), requires_human_review: z.boolean().default(true) });
export const projectNoteSchema = z.object({ project_id: z.string().uuid(), content: z.string().trim().min(1).max(4000) });
export type CustomerInput = z.infer<typeof customerSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
