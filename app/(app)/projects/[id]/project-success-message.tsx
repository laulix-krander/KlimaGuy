import React from "react";

export type ProjectSuccessSearchParams = {
  created?: string;
  updated?: string;
  status_updated?: string;
  class_updated?: string;
  summary_updated?: string;
  human_review_updated?: string;
  review_updated?: string;
  note_created?: string;
  note_updated?: string;
  note_deleted?: string;
};

// These are the success parameters currently produced by the project actions.
// Keeping the parameter and message pairs here makes every supported redirect explicit.
const PROJECT_SUCCESS_MESSAGES = [
  ["created", "Projekt wurde angelegt."],
  ["updated", "Projektdaten wurden aktualisiert."],
  ["status_updated", "Projektstatus wurde aktualisiert."],
  ["class_updated", "Projektklasse wurde aktualisiert."],
  ["summary_updated", "Projektzusammenfassung wurde aktualisiert."],
  ["human_review_updated", "Human Review wurde aktualisiert."],
  ["review_updated", "Projektprüfung wurde aktualisiert."],
  ["note_created", "Notiz wurde hinzugefügt."],
  ["note_updated", "Notiz wurde aktualisiert."],
  ["note_deleted", "Notiz wurde gelöscht."],
] as const satisfies ReadonlyArray<readonly [keyof ProjectSuccessSearchParams, string]>;

export function getProjectSuccessMessage(searchParams: ProjectSuccessSearchParams): string | null {
  return PROJECT_SUCCESS_MESSAGES.find(([parameter]) => searchParams[parameter] === "1")?.[1] ?? null;
}

export function ProjectSuccessMessage({ searchParams }: { searchParams: ProjectSuccessSearchParams }) {
  const message = getProjectSuccessMessage(searchParams);

  if (!message) return null;

  return (
    <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
      {message}
    </div>
  );
}
