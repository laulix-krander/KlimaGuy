import { describe, expect, it } from "vitest";
import { customerSchema, projectClassSchema, projectNoteSchema, projectSchema, projectStatusSchema, roleSchema } from "@/lib/domain/schemas";
import { canCreateCustomer, canCustomerBeDeleted, canDeleteCustomer, canEditCustomer, canEditNote, canEditProjectField } from "@/lib/domain/permissions";
import { humanReviewDefault, statusToLabel } from "@/lib/domain/mappers";
import { allowedStatusTransitions, canTransitionProjectStatus } from "@/lib/domain/project-status";
import { projectClasses, projectStatuses } from "@/lib/domain/types";

describe("Domain validation", () => {
  it("validiert Rollen", () => { expect(roleSchema.parse("admin")).toBe("admin"); expect(roleSchema.safeParse("customer").success).toBe(false); });
  it("weist ungültigen Status ab", () => { expect(projectStatusSchema.parse("technical_review")).toBe("technical_review"); expect(projectStatusSchema.safeParse("invalid").success).toBe(false); });
  it("validiert Projektklassen", () => { projectClasses.forEach((projectClass) => expect(projectClassSchema.parse(projectClass)).toBe(projectClass)); expect(projectClassSchema.safeParse("E").success).toBe(false); });
  it("setzt requires_human_review standardmäßig auf true", () => { const parsed = projectSchema.parse({ customer_id: "11111111-1111-4111-8111-111111111111", title: "Testprojekt" }); expect(parsed.requires_human_review).toBe(true); });
});

describe("Statusübergänge", () => {
  it("erlaubt alle definierten Statusübergänge", () => { projectStatuses.forEach((from) => allowedStatusTransitions[from].forEach((to) => expect(canTransitionProjectStatus(from, to)).toBe(true))); });
  it("verbietet mehrere nicht erlaubte Statusübergänge", () => { expect(canTransitionProjectStatus("new", "accepted")).toBe(false); expect(canTransitionProjectStatus("quote_sent", "technical_review")).toBe(false); expect(canTransitionProjectStatus("accepted", "quote_sent")).toBe(false); });
  it("closed erlaubt keine weiteren Übergänge außer unverändert", () => { expect(allowedStatusTransitions.closed).toHaveLength(0); expect(canTransitionProjectStatus("closed", "new")).toBe(false); expect(canTransitionProjectStatus("closed", "closed")).toBe(true); });
});

describe("Schemas", () => {
  it("validiert Kundendaten und normalisiert optionale Felder", () => { const parsed = customerSchema.parse({ first_name: " Max ", last_name: " Muster ", email: "", phone: "  " }); expect(parsed).toEqual({ first_name: "Max", last_name: "Muster", email: null, phone: null }); });
  it("weist ungültige E-Mail und leere Pflichtfelder ab", () => { expect(customerSchema.safeParse({ first_name: " ", last_name: "Test", email: "x", phone: "" }).success).toBe(false); });
  it("validiert Projektdaten", () => { const parsed = projectSchema.parse({ customer_id: "11111111-1111-4111-8111-111111111111", title: " Büro ", status: "new", project_class: "A" }); expect(parsed.title).toBe("Büro"); expect(parsed.project_class).toBe("A"); });
  it("weist ungültigen Projektstatus und ungültige Klasse ab", () => { expect(projectSchema.safeParse({ customer_id: "11111111-1111-4111-8111-111111111111", title: "Büro", status: "bad" }).success).toBe(false); expect(projectSchema.safeParse({ customer_id: "11111111-1111-4111-8111-111111111111", title: "Büro", project_class: "Z" }).success).toBe(false); });
  it("weist leere Notizen ab", () => { expect(projectNoteSchema.safeParse({ project_id: "11111111-1111-4111-8111-111111111111", content: "   " }).success).toBe(false); });
});

describe("Berechtigungen", () => {
  it("mappt Statuslabels zentral", () => { expect(statusToLabel("human_review")).toBe("Menschliche Prüfung"); });
  it("Admin darf Kunden anlegen, bearbeiten und löschen", () => { expect(canCreateCustomer("admin")).toBe(true); expect(canEditCustomer("admin")).toBe(true); expect(canDeleteCustomer("admin")).toBe(true); });
  it("Reviewer darf Kunden nicht anlegen, bearbeiten oder löschen", () => { expect(canCreateCustomer("reviewer")).toBe(false); expect(canEditCustomer("reviewer")).toBe(false); expect(canDeleteCustomer("reviewer")).toBe(false); });
  it("Reviewer darf Projektstatus und Klasse, aber keine Stammdaten ändern", () => { expect(canEditProjectField("reviewer", "status")).toBe(true); expect(canEditProjectField("reviewer", "project_class")).toBe(true); expect(canEditProjectField("reviewer", "title")).toBe(false); expect(canEditProjectField("reviewer", "customer_id")).toBe(false); });
  it("Notizrechte werden korrekt berechnet", () => { expect(canEditNote("reviewer", "u1", "u1")).toBe(true); expect(canEditNote("reviewer", "u2", "u1")).toBe(false); expect(canEditNote("admin", "u2", "u1")).toBe(true); });
  it("aktive Projekte blockieren Kundenlöschung", () => { expect(canCustomerBeDeleted(["new"])).toBe(false); expect(canCustomerBeDeleted(["rejected", "closed"])).toBe(true); });
  it("Human Review Default Mapper ist sicher", () => { expect(humanReviewDefault()).toBe(true); });
});
