"use client";

import { useActionState } from "react";
import { updateProjectSummaryAction } from "@/lib/actions/projects";
import { optionalFormValue } from "@/lib/domain/display";
import { firstProjectFieldError, ProjectFieldError, ProjectFormError } from "./project-form-errors";
import { useProjectFormReset } from "./use-project-form-reset";

type ProjectSummaryFormProps = {
  projectId: string;
  summary: string | null;
};

const initialState = { success: false as const, error: "" };

export function ProjectSummaryForm({ projectId, summary }: ProjectSummaryFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectSummaryAction, initialState);
  const summaryError = firstProjectFieldError(state, "summary");
  const formRef = useProjectFormReset(state.success);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <ProjectFormError error={state.success ? undefined : state.error} />
      <label className="sr-only" htmlFor="summary">Projektzusammenfassung</label>
      <textarea
        className="min-h-32 w-full rounded border px-3 py-2"
        defaultValue={optionalFormValue(summary)}
        id="summary"
        maxLength={4000}
        name="summary"
        placeholder="Interne Zusammenfassung ergänzen"
        aria-describedby={summaryError ? "summary-error" : undefined}
        aria-invalid={summaryError ? true : undefined}
        disabled={pending}
      />
      <ProjectFieldError id="summary-error" error={summaryError} />
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Zusammenfassung speichern"}
      </button>
    </form>
  );
}
