import { projectClassToLabel } from "./mappers";
import type { ProjectClass } from "./types";

export function optionalFieldDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Nicht angegeben";
}

export function optionalFormValue(value: string | null | undefined): string {
  return value ?? "";
}

export function projectClassDisplay(value: ProjectClass | null | undefined): string {
  return value ? projectClassToLabel(value) : "Noch nicht klassifiziert";
}

export function humanReviewDisplay(value: boolean): string {
  return value ? "Menschliche Prüfung erforderlich" : "Keine menschliche Prüfung erforderlich";
}

export function projectSummaryDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Noch keine Zusammenfassung vorhanden.";
}
