import type { UpdatedProject } from "./project-update-service";

export function getProjectCoreRevalidationPaths(project: UpdatedProject): string[] {
  return ["/projects", `/projects/${project.id}`, `/customers/${project.customer_id}`];
}
