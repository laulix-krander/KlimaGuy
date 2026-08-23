import { z } from "zod";

export const PROJECT_EXECUTION_STATUSES = ["not_started", "active", "completed", "cancelled"] as const;
export const projectExecutionStatusSchema = z.enum(PROJECT_EXECUTION_STATUSES);
export type ProjectExecutionStatus = z.infer<typeof projectExecutionStatusSchema>;

export const projectExecutionDtoSchema = z.object({
  id: z.string().uuid(), project_id: z.string().uuid(), accepted_offer_id: z.string().uuid(),
  status: projectExecutionStatusSchema, revision: z.number().int().positive(),
  started_at: z.string().datetime({ offset: true }).nullable(), completed_at: z.string().datetime({ offset: true }).nullable(),
  cancelled_at: z.string().datetime({ offset: true }).nullable(), created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
}).strict();
export type ProjectExecutionDto = z.infer<typeof projectExecutionDtoSchema>;

export const transitionProjectExecutionSchema = z.object({
  executionId: z.string().uuid(), expectedRevision: z.number().int().positive(), idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

const transitions: Readonly<Record<ProjectExecutionStatus, readonly ProjectExecutionStatus[]>> = Object.freeze({
  not_started: ["active", "cancelled"], active: ["completed", "cancelled"], completed: [], cancelled: [],
});
export function isProjectExecutionTransitionAllowed(from: ProjectExecutionStatus, to: ProjectExecutionStatus): boolean { return transitions[from].includes(to); }
export function executionDependencyStatus(status: ProjectExecutionStatus): "open" | "resolved" { return status === "not_started" || status === "active" ? "open" : "resolved"; }
