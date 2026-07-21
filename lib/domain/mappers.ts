import type { ProjectClass, ProjectStatus, Role } from "./types";

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = Object.freeze({
  new: "Neu",
  collecting_information: "Informationen werden gesammelt",
  technical_review: "Technische Prüfung",
  quote_draft: "Angebotsentwurf",
  human_review: "Menschliche Prüfung",
  quote_sent: "Angebot versendet",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  closed: "Abgeschlossen",
});

export const PROJECT_CLASS_LABELS: Readonly<Record<ProjectClass, string>> = Object.freeze({
  A: "Standardprojekt",
  B: "Rückfragen erforderlich",
  C: "Vor-Ort-Termin erforderlich",
  D: "Ablehnung oder Sonderprojekt",
});

export const PROJECT_CLASS_DESCRIPTIONS: Readonly<Record<ProjectClass, string>> = Object.freeze({
  A: "Standardprojekt mit klarer Einbausituation und überschaubarem Aufwand.",
  B: "Projekt benötigt zusätzliche Angaben, Maße oder Bilder.",
  C: "Projekt muss vor Ort technisch geprüft werden.",
  D: "Projekt ist ein Sonderfall oder sollte abgelehnt beziehungsweise weitergeleitet werden.",
});

export const ROLE_LABELS: Readonly<Record<Role, string>> = Object.freeze({
  admin: "Administrator",
  reviewer: "Prüfer",
});

export const statusLabels = PROJECT_STATUS_LABELS;

export function statusToLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status];
}

export function projectClassToLabel(projectClass: ProjectClass): string {
  return PROJECT_CLASS_LABELS[projectClass];
}

export function projectClassToDescription(projectClass: ProjectClass): string {
  return PROJECT_CLASS_DESCRIPTIONS[projectClass];
}

export function roleToLabel(role: Role): string {
  return ROLE_LABELS[role];
}
export { canSoftDeleteCustomer } from "./permissions";
export { DEFAULT_REQUIRES_HUMAN_REVIEW } from "./types";

export function humanReviewDefault(value?: boolean): boolean {
  return value ?? true;
}
