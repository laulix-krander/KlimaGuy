"use client";

import { useActionState } from "react";
import { updateProjectSummaryAction } from "@/lib/actions/projects";
import { optionalFormValue } from "@/lib/domain/display";

type ProjectSummaryFormProps = {
  projectId: string;
  summary: string | null;
};

const initialState = { success: false as const, error: "" };

export function ProjectSummaryForm({ projectId, summary }: ProjectSummaryFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectSummaryAction, initialState);

  return (
    <form action={formAction} aria-busy={pending} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {state.success === false && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      ) : null}
      <label className="sr-only" htmlFor="summary">Projektzusammenfassung</label>
      <textarea
        className="min-h-32 w-full rounded border px-3 py-2"
        defaultValue={optionalFormValue(summary)}
        id="summary"
        maxLength={4000}
        name="summary"
        placeholder="Interne Zusammenfassung ergänzen"
        disabled={pending}
      />
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Zusammenfassung speichern"}
      </button>
    </form>
  );
}
