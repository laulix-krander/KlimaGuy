import { describe, expect, it } from "vitest";
import {
  getProjectAndCustomerRevalidationPaths,
  getProjectDetailRevalidationPaths,
  getProjectOverviewRevalidationPaths,
} from "@/lib/actions/project-revalidation";

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_id: "22222222-2222-4222-8222-222222222222",
};
const detailPath = `/projects/${project.id}`;
const customerPath = `/customers/${project.customer_id}`;

describe("project revalidation paths", () => {
  it.each([
    ["Projekt-Stammdaten", getProjectAndCustomerRevalidationPaths, ["/projects", detailPath, customerPath]],
    ["Projektstatus", getProjectAndCustomerRevalidationPaths, ["/projects", detailPath, customerPath]],
    ["Projektklasse", getProjectOverviewRevalidationPaths, ["/projects", detailPath]],
    ["Projektzusammenfassung", getProjectDetailRevalidationPaths, [detailPath]],
    ["Human Review", getProjectOverviewRevalidationPaths, ["/projects", detailPath]],
    ["Sammelworkflow", getProjectAndCustomerRevalidationPaths, ["/projects", detailPath, customerPath]],
  ])("declares only the visible dependencies for %s", (_workflow, getPaths, expected) => {
    expect(getPaths(project)).toEqual(expected);
  });

  it.each([
    getProjectDetailRevalidationPaths,
    getProjectOverviewRevalidationPaths,
    getProjectAndCustomerRevalidationPaths,
  ])("returns every path at most once", (getPaths) => {
    const paths = getPaths(project);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("does not add unrelated routes", () => {
    const declaredPaths = [
      ...getProjectDetailRevalidationPaths(project),
      ...getProjectOverviewRevalidationPaths(project),
      ...getProjectAndCustomerRevalidationPaths(project),
    ];

    expect(declaredPaths).not.toContain("/");
    expect(declaredPaths).not.toContain("/dashboard");
    expect(declaredPaths).not.toContain("/customers");
  });
});
