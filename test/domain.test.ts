import { describe, expect, it } from "vitest";
import { projectClassSchema, projectSchema, projectStatusSchema, roleSchema } from "@/lib/domain/schemas";
import { canSoftDeleteCustomer, humanReviewDefault, statusToLabel } from "@/lib/domain/mappers";

describe("Domain validation", () => {
  it("validiert Rollen", () => {
    expect(roleSchema.parse("admin")).toBe("admin");
    expect(roleSchema.safeParse("customer").success).toBe(false);
  });
  it("weist ungültigen Status ab", () => {
    expect(projectStatusSchema.parse("technical_review")).toBe("technical_review");
    expect(projectStatusSchema.safeParse("invalid").success).toBe(false);
  });
  it("validiert Projektklassen", () => {
    expect(projectClassSchema.parse("A")).toBe("A");
    expect(projectClassSchema.safeParse("E").success).toBe(false);
  });
  it("setzt requires_human_review standardmäßig auf true", () => {
    const parsed = projectSchema.parse({ customer_id: "11111111-1111-4111-8111-111111111111", title: "Testprojekt" });
    expect(parsed.requires_human_review).toBe(true);
  });
});

describe("Mapper und Berechtigungen", () => {
  it("mappt Statuslabels zentral", () => {
    expect(statusToLabel("human_review")).toBe("Menschliche Prüfung");
  });
  it("behandelt nicht angemeldete Nutzer restriktiv", () => {
    expect(canSoftDeleteCustomer(null)).toBe(false);
  });
  it("Reviewer darf keine Kunden löschen", () => {
    expect(canSoftDeleteCustomer("reviewer")).toBe(false);
  });
  it("Admin darf Kunden soft löschen", () => {
    expect(canSoftDeleteCustomer("admin")).toBe(true);
  });
  it("Human Review Default Mapper ist sicher", () => {
    expect(humanReviewDefault()).toBe(true);
  });
});
