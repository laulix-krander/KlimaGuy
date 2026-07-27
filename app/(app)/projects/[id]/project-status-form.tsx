"use client";

import { useActionState } from "react";
import { updateProjectStatusAction } from "@/lib/actions/projects";
import { PROJECT_STATUS_LABELS } from "@/lib/domain/mappers";
import { getAllowedProjectStatusTransitions } from "@/lib/domain/project-status";
import type { ProjectStatus } from "@/lib/domain/types";
import { firstProjectFieldError, ProjectFieldError, ProjectFormError } from "./project-form-errors";
import { useProjectFormReset } from "./use-project-form-reset";

type ProjectStatusFormProps = {
  projectId: string;
  status: ProjectStatus;
};

const initialState = { success: false as const, error: "" };

export function ProjectStatusForm({ projectId, status }: ProjectStatusFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectStatusAction, initialState);
  const statusOptions = [status, ...getAllowedProjectStatusTransitions(status)];
  const statusError = firstProjectFieldError(state, "status");
  const formRef = useProjectFormReset(state.success);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <ProjectFormError error={state.success ? undefined : state.error} />
      <label className="sr-only" htmlFor="status">Projektstatus</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select id="status" name="status" defaultValue={status} className="w-full rounded border px-3 py-2 sm:w-auto" aria-describedby={statusError ? "status-error" : undefined} aria-invalid={statusError ? true : undefined} disabled={pending}>
          {statusOptions.map((option) => (
            <option key={option} value={option}>{PROJECT_STATUS_LABELS[option]}</option>
          ))}
        </select>
        <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Wird gespeichert …" : "Status speichern"}
        </button>
      </div>
      <ProjectFieldError id="status-error" error={statusError} />
    </form>
  );
}
