import { canManageProjectExecution } from "@/lib/domain/permissions";
import { projectExecutionDtoSchema, transitionProjectExecutionSchema, type ProjectExecutionDto } from "@/lib/domain/project-execution";
import { roleSchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./project-create-service";

type Command = "start_project_execution" | "complete_project_execution" | "cancel_project_execution";
export type ProjectExecutionDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getRole(actorId: string): Promise<string | null>;
  rpc(name: Command, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export async function transitionProjectExecution(ds: ProjectExecutionDataSource, action: "start" | "complete" | "cancel", input: unknown): Promise<ActionResult<ProjectExecutionDto>> {
  const parsed = transitionProjectExecutionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Die Ausführungsanfrage ist ungültig." };
  const { data } = await ds.auth.getUser();
  if (!data.user) return { success: false, error: "Sie müssen angemeldet sein." };
  const role = roleSchema.safeParse(await ds.getRole(data.user.id));
  if (!role.success || !canManageProjectExecution(role.data)) return { success: false, error: "Sie sind nicht berechtigt, die Ausführung zu verwalten." };
  const rpc = ({ start: "start_project_execution", complete: "complete_project_execution", cancel: "cancel_project_execution" } as const)[action];
  const result = await ds.rpc(rpc, { target_execution_id: parsed.data.executionId, expected_revision: parsed.data.expectedRevision, target_idempotency_key: parsed.data.idempotencyKey });
  if (result.error) return { success: false, error: "Die Ausführungsänderung konnte nicht sicher gespeichert werden." };
  const dto = projectExecutionDtoSchema.safeParse(result.data);
  return dto.success ? { success: true, data: dto.data } : { success: false, error: "Die Ausführungsantwort war ungültig." };
}
