"use client";

import { useActionState } from "react";
import { updateProjectStatusAction } from "@/lib/actions/projects";
import { PROJECT_STATUS_LABELS } from "@/lib/domain/mappers";
import { getAllowedProjectStatusTransitions } from "@/lib/domain/project-status";
import type { ProjectStatus } from "@/lib/domain/types";

type ProjectStatusFormProps = {
  projectId: string;
  status: ProjectStatus;
};

const initialState = { success: false as const, error: "" };

export function ProjectStatusForm({ projectId, status }: ProjectStatusFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectStatusAction, initialState);
  const statusOptions = [status, ...getAllowedProjectStatusTransitions(status)];

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {state.success === false && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      ) : null}
      <label className="sr-only" htmlFor="status">Projektstatus</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select id="status" name="status" defaultValue={status} className="w-full rounded border px-3 py-2 sm:w-auto">
          {statusOptions.map((option) => (
            <option key={option} value={option}>{PROJECT_STATUS_LABELS[option]}</option>
          ))}
        </select>
        <button className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Wird gespeichert …" : "Status speichern"}
        </button>
      </div>
    </form>
  );
}
