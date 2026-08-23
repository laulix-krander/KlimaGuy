import { z } from "zod";
import { projectExecutionDtoSchema, type ProjectExecutionDto } from "@/lib/domain/project-execution";

export type ProjectExecutionReadDataSource = { current(projectId: string): Promise<{ data: unknown; error: unknown }> };
export async function readCurrentProjectExecution(ds: ProjectExecutionReadDataSource, projectId: unknown): Promise<ProjectExecutionDto | null> {
  const id = z.string().uuid().parse(projectId); const result = await ds.current(id);
  if (result.error) throw new Error("Die Ausführung konnte nicht geladen werden.");
  return result.data === null ? null : projectExecutionDtoSchema.parse(result.data);
}
