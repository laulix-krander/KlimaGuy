"use client";

import { useActionState } from "react";
import { updateProjectReviewAction } from "@/lib/actions/projects";
import { PROJECT_CLASS_DESCRIPTIONS, PROJECT_CLASS_LABELS, PROJECT_STATUS_LABELS } from "@/lib/domain/mappers";
import { getAllowedProjectStatusTransitions } from "@/lib/domain/project-status";
import { PROJECT_CLASSES, type ProjectClass, type ProjectStatus } from "@/lib/domain/types";

type ProjectReviewFormProps = {
  projectId: string;
  status: ProjectStatus;
  projectClass: ProjectClass | null;
  requiresHumanReview: boolean;
};

const initialState = { success: false as const, error: "" };

export function ProjectReviewForm({ projectId, status, projectClass, requiresHumanReview }: ProjectReviewFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectReviewAction, initialState);
  const statusOptions = [status, ...getAllowedProjectStatusTransitions(status)];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      {state.success === false && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      ) : null}
      <div>
        <label className="block text-sm font-medium" htmlFor="status">Projektstatus</label>
        <select id="status" name="status" defaultValue={status} className="mt-1 w-full rounded border px-3 py-2">
          {statusOptions.map((option) => (
            <option key={option} value={option}>{PROJECT_STATUS_LABELS[option]}</option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Projektklasse</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {PROJECT_CLASSES.map((value) => (
            <label key={value} className="rounded border p-3 text-sm">
              <input className="mr-2" type="radio" name="project_class" value={value} defaultChecked={projectClass === value} required />
              <span className="font-medium">{value} – {PROJECT_CLASS_LABELS[value]}</span>
              <span className="mt-1 block text-slate-600">{PROJECT_CLASS_DESCRIPTIONS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="requires_human_review" defaultChecked={requiresHumanReview} />
        Menschliche Prüfung erforderlich
      </label>
      <button className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Prüfung speichern"}
      </button>
    </form>
  );
}
