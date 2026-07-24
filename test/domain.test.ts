import { describe, expect, it } from "vitest";
import {
  nullableProjectClassSchema,
  projectClassSchema,
  projectSchema,
  projectStatusSchema,
  requiresHumanReviewSchema,
  roleSchema,
} from "@/lib/domain/schemas";
import { PROJECT_CLASSES, PROJECT_STATUSES } from "@/lib/domain/types";
import {
  ALLOWED_PROJECT_STATUS_TRANSITIONS,
  getAllowedProjectStatusTransitions,
  isProjectStatusTransitionAllowed,
} from "@/lib/domain/project-status";
import {
  canChangeHumanReview,
  canChangeProjectClass,
  canChangeProjectStatus,
  canCreateCustomer,
  canCreateProject,
  canCreateProjectNote,
  canEditAnyProjectNote,
  canEditCustomer,
  canEditOwnProjectNote,
  canEditProjectCoreFields,
  canEditProjectSummary,
  canSoftDeleteAnyProjectNote,
  canSoftDeleteCustomer,
  canSoftDeleteOwnProjectNote,
  canSoftDeleteProject,
} from "@/lib/domain/permissions";
import { projectClassToDescription, projectClassToLabel, roleToLabel, statusToLabel } from "@/lib/domain/mappers";
import { humanReviewDisplay, projectClassDisplay, projectSummaryDisplay } from "@/lib/domain/display";

describe("Projektstatus", () => {
  it("validiert alle neun Statuswerte und weist unbekannte oder leere Werte ab", () => {
    expect(PROJECT_STATUSES).toHaveLength(9);
    for (const status of PROJECT_STATUSES) expect(projectStatusSchema.parse(status)).toBe(status);
    expect(projectStatusSchema.safeParse("unknown").success).toBe(false);
    expect(projectStatusSchema.safeParse("").success).toBe(false);
  });

  it("stellt deutsche Statuslabels zentral bereit", () => {
    expect(statusToLabel("new")).toBe("Neu");
    expect(statusToLabel("collecting_information")).toBe("Informationen werden gesammelt");
    expect(statusToLabel("quote_sent")).toBe("Angebot versendet");
    expect(statusToLabel("closed")).toBe("Abgeschlossen");
  });
});

describe("Projektstatus-Übergänge", () => {
  it("erlaubt jeden Übergang aus der Matrix", () => {
    for (const [from, transitions] of Object.entries(ALLOWED_PROJECT_STATUS_TRANSITIONS)) {
      for (const to of transitions) expect(isProjectStatusTransitionAllowed(from as never, to)).toBe(true);
    }
  });

  it.each([
    ["new", "new"],
    ["new", "technical_review"],
    ["new", "quote_sent"],
    ["new", "accepted"],
    ["collecting_information", "accepted"],
    ["technical_review", "accepted"],
    ["quote_sent", "technical_review"],
    ["quote_sent", "collecting_information"],
    ["accepted", "quote_sent"],
    ["accepted", "rejected"],
    ["rejected", "accepted"],
    ["closed", "new"],
    ["closed", "closed"],
  ] as const)("verbietet %s → %s", (from, to) => {
    expect(isProjectStatusTransitionAllowed(from, to)).toBe(false);
  });

  it("liefert für closed eine leere Übergangsliste", () => {
    expect(getAllowedProjectStatusTransitions("closed")).toEqual([]);
  });

  it("schützt die interne Matrix vor Mutation über Rückgabewerte", () => {
    const transitions = getAllowedProjectStatusTransitions("new") as string[];
    transitions.push("accepted");
    expect(getAllowedProjectStatusTransitions("new")).toEqual(["collecting_information", "rejected", "closed"]);
    expect(isProjectStatusTransitionAllowed("new", "accepted")).toBe(false);
  });

  it("schützt die zentrale Matrix vor versehentlicher Mutation", () => {
    expect(Object.isFrozen(ALLOWED_PROJECT_STATUS_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(ALLOWED_PROJECT_STATUS_TRANSITIONS.new)).toBe(true);
    expect(() => (ALLOWED_PROJECT_STATUS_TRANSITIONS.new as string[]).push("accepted")).toThrow(TypeError);
    expect(isProjectStatusTransitionAllowed("new", "accepted")).toBe(false);
  });
});

describe("Projektklassen", () => {
  it("validiert A bis D, null im Nullable-Schema und weist E oder leere Strings ab", () => {
    for (const projectClass of PROJECT_CLASSES) expect(projectClassSchema.parse(projectClass)).toBe(projectClass);
    expect(nullableProjectClassSchema.parse(null)).toBeNull();
    expect(projectClassSchema.safeParse("E").success).toBe(false);
    expect(projectClassSchema.safeParse("").success).toBe(false);
  });

  it("stellt Labels und Beschreibungen bereit", () => {
    expect(projectClassToLabel("A")).toBe("Standardprojekt");
    expect(projectClassToLabel("D")).toBe("Ablehnung oder Sonderprojekt");
    expect(projectClassToDescription("B")).toBe("Projekt benötigt zusätzliche Angaben, Maße oder Bilder.");
  });
});

describe("Rollen", () => {
  it("validiert admin und reviewer und weist andere Rollen ab", () => {
    expect(roleSchema.parse("admin")).toBe("admin");
    expect(roleSchema.parse("reviewer")).toBe("reviewer");
    expect(roleSchema.safeParse("customer").success).toBe(false);
  });

  it("stellt Rollenlabels bereit", () => {
    expect(roleToLabel("admin")).toBe("Administrator");
    expect(roleToLabel("reviewer")).toBe("Prüfer");
  });
});

describe("Human Review", () => {
  it("setzt fehlende Werte auf true und respektiert explizite boolesche Werte", () => {
    expect(requiresHumanReviewSchema.parse(undefined)).toBe(true);
    expect(requiresHumanReviewSchema.parse(true)).toBe(true);
    expect(requiresHumanReviewSchema.parse(false)).toBe(false);
    expect(projectSchema.parse({ customer_id: "11111111-1111-4111-8111-111111111111", title: "Testprojekt" }).requires_human_review).toBe(true);
  });

  it("weist ungültige Human-Review-Werte ab", () => {
    expect(requiresHumanReviewSchema.safeParse("true").success).toBe(false);
  });
});

describe("Berechtigungen Admin", () => {
  it("erlaubt alle fachlichen Admin-Berechtigungen", () => {
    const actorId = "11111111-1111-4111-8111-111111111111";
    const noteCreatedBy = "22222222-2222-4222-8222-222222222222";
    expect(canCreateCustomer("admin")).toBe(true);
    expect(canEditCustomer("admin")).toBe(true);
    expect(canSoftDeleteCustomer("admin")).toBe(true);
    expect(canCreateProject("admin")).toBe(true);
    expect(canEditProjectCoreFields("admin")).toBe(true);
    expect(canChangeProjectStatus("admin")).toBe(true);
    expect(canChangeProjectClass("admin")).toBe(true);
    expect(canChangeHumanReview("admin")).toBe(true);
    expect(canEditProjectSummary("admin")).toBe(true);
    expect(canSoftDeleteProject("admin")).toBe(true);
    expect(canCreateProjectNote("admin")).toBe(true);
    expect(canEditAnyProjectNote("admin")).toBe(true);
    expect(canSoftDeleteAnyProjectNote("admin")).toBe(true);
    expect(canEditOwnProjectNote("admin", actorId, noteCreatedBy)).toBe(false);
    expect(canSoftDeleteOwnProjectNote("admin", actorId, noteCreatedBy)).toBe(false);
  });
});

describe("Berechtigungen Reviewer", () => {
  it("setzt alle fachlichen Reviewer-Berechtigungen rein rollenbasiert um", () => {
    const actorId = "11111111-1111-4111-8111-111111111111";
    const ownNoteCreatedBy = "11111111-1111-4111-8111-111111111111";
    const otherNoteCreatedBy = "22222222-2222-4222-8222-222222222222";
    expect(canCreateCustomer("reviewer")).toBe(false);
    expect(canEditCustomer("reviewer")).toBe(false);
    expect(canSoftDeleteCustomer("reviewer")).toBe(false);
    expect(canCreateProject("reviewer")).toBe(false);
    expect(canEditProjectCoreFields("reviewer")).toBe(false);
    expect(canChangeProjectStatus("reviewer")).toBe(true);
    expect(canChangeProjectClass("reviewer")).toBe(true);
    expect(canChangeHumanReview("reviewer")).toBe(false);
    expect(canEditProjectSummary("reviewer")).toBe(false);
    expect(canSoftDeleteProject("reviewer")).toBe(false);
    expect(canCreateProjectNote("reviewer")).toBe(true);
    expect(canEditAnyProjectNote("reviewer")).toBe(false);
    expect(canEditOwnProjectNote("reviewer", actorId, ownNoteCreatedBy)).toBe(true);
    expect(canEditOwnProjectNote("reviewer", actorId, otherNoteCreatedBy)).toBe(false);
    expect(canSoftDeleteAnyProjectNote("reviewer")).toBe(false);
    expect(canSoftDeleteOwnProjectNote("reviewer", actorId, ownNoteCreatedBy)).toBe(true);
    expect(canSoftDeleteOwnProjectNote("reviewer", actorId, otherNoteCreatedBy)).toBe(false);
  });
});


describe("Anzeige-Helfer für Projekte", () => {
  it("stellt Projektklasse, Human Review und optionale Zusammenfassung sicher dar", () => {
    expect(projectClassDisplay(null)).toBe("Noch nicht klassifiziert");
    expect(projectClassDisplay("A")).toBe("Standardprojekt");
    expect(humanReviewDisplay(true)).toBe("Menschliche Prüfung erforderlich");
    expect(humanReviewDisplay(false)).toBe("Keine menschliche Prüfung erforderlich");
    expect(projectSummaryDisplay(null)).toBe("Noch keine Zusammenfassung vorhanden.");
    expect(projectSummaryDisplay("  Kurzinfo  ")).toBe("Kurzinfo");
  });
});
