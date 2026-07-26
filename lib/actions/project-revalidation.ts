type ProjectRevalidationTarget = {
  id: string;
  customer_id: string;
};

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

export function getProjectDetailRevalidationPaths(project: ProjectRevalidationTarget): string[] {
  return [`/projects/${project.id}`];
}

export function getProjectOverviewRevalidationPaths(project: ProjectRevalidationTarget): string[] {
  return uniquePaths(["/projects", ...getProjectDetailRevalidationPaths(project)]);
}

export function getProjectAndCustomerRevalidationPaths(project: ProjectRevalidationTarget): string[] {
  return uniquePaths([
    ...getProjectOverviewRevalidationPaths(project),
    ...getProjectDetailRevalidationPaths(project),
    `/customers/${project.customer_id}`,
  ]);
}
