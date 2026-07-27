import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const specializedProjectFormFiles = [
  "app/(app)/projects/[id]/edit/project-edit-form.tsx",
  "app/(app)/projects/[id]/project-metadata-form.tsx",
  "app/(app)/projects/[id]/project-status-form.tsx",
  "app/(app)/projects/[id]/project-class-form.tsx",
  "app/(app)/projects/[id]/project-summary-form.tsx",
  "app/(app)/projects/[id]/project-human-review-form.tsx",
] as const;

function source(file: string): string {
  return readFileSync(file, "utf8");
}

describe("project UX architecture regressions", () => {
  it.each(specializedProjectFormFiles)("keeps %s on the central error components", (file) => {
    const contents = source(file);

    expect(contents).toMatch(/import \{[^}]*ProjectFieldError[^}]*ProjectFormError[^}]*\} from "\.\.?(?:\/)?project-form-errors";/);
    expect(contents).toContain("<ProjectFormError");
    expect(contents).toContain("<ProjectFieldError");
  });

  it("keeps only the specialized review-property forms on the project detail page", () => {
    const contents = source("app/(app)/projects/[id]/page.tsx");

    expect(contents).toContain("<ProjectStatusForm");
    expect(contents).toContain("<ProjectClassForm");
    expect(contents).toContain("<ProjectHumanReviewForm");
    expect(contents).not.toContain("ProjectReviewForm");
    expect(existsSync("app/(app)/projects/[id]/project-review-form.tsx")).toBe(false);
  });

  it("removes the combined action, service, schema, and multi-field update path", () => {
    const actions = source("lib/actions/projects.ts");
    const schemas = source("lib/domain/schemas.ts");

    expect(actions).not.toContain("updateProjectReviewAction");
    expect(actions).not.toContain("project-review-service");
    expect(schemas).not.toContain("updateProjectReviewSchema");
    expect(existsSync("lib/actions/project-review-service.ts")).toBe(false);

    for (const action of ["updateProjectStatusAction", "updateProjectClassAction", "updateProjectHumanReviewAction"]) {
      const start = actions.indexOf(`export async function ${action}`);
      const nextAction = actions.indexOf("export async function ", start + 1);
      const actionSource = actions.slice(start, nextAction === -1 ? undefined : nextAction);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(actionSource).not.toMatch(/status[\s\S]*project_class[\s\S]*requires_human_review/);
    }
  });

  it("keeps the project detail page on the central success component", () => {
    const contents = source("app/(app)/projects/[id]/page.tsx");

    expect(contents).toMatch(/import \{ ProjectSuccessMessage,[^}]+\} from "\.\/project-success-message";/);
    expect(contents).toContain("<ProjectSuccessMessage searchParams={successSearchParams}");
  });

  it.each([
    ["updateProjectCoreAction", "getProjectAndCustomerRevalidationPaths"],
    ["updateProjectStatusAction", "getProjectAndCustomerRevalidationPaths"],
    ["updateProjectClassAction", "getProjectOverviewRevalidationPaths"],
    ["updateProjectSummaryAction", "getProjectDetailRevalidationPaths"],
    ["updateProjectHumanReviewAction", "getProjectOverviewRevalidationPaths"],
  ])("keeps %s on %s", (action, utility) => {
    const contents = source("lib/actions/projects.ts");
    const start = contents.indexOf(`export async function ${action}`);
    const nextAction = contents.indexOf("export async function ", start + 1);
    const actionSource = contents.slice(start, nextAction === -1 ? undefined : nextAction);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(actionSource).toContain(`for (const path of ${utility}(result.data))`);
    expect(actionSource).toContain("revalidatePath(path)");
  });
});
