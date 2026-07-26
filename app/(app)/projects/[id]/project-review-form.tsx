"use client";

import { useActionState } from "react";
import { updateProjectReviewAction } from "@/lib/actions/projects";
import { PROJECT_CLASS_DESCRIPTIONS, PROJECT_CLASS_LABELS, PROJECT_STATUS_LABELS } from "@/lib/domain/mappers";
import { getAllowedProjectStatusTransitions } from "@/lib/domain/project-status";
import { PROJECT_CLASSES, type ProjectClass, type ProjectStatus } from "@/lib/domain/types";
import { firstProjectFieldError, ProjectFieldError, ProjectFormError } from "./project-form-errors";

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
  const statusError = firstProjectFieldError(state, "status");
  const projectClassError = firstProjectFieldError(state, "project_class");
  const humanReviewError = firstProjectFieldError(state, "requires_human_review");

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      <ProjectFormError error={state.success ? undefined : state.error} />
      <div>
        <label className="block text-sm font-medium" htmlFor="status">Projektstatus</label>
        <select id="status" name="status" defaultValue={status} className="mt-1 w-full rounded border px-3 py-2" aria-describedby={statusError ? "review-status-error" : undefined} aria-invalid={statusError ? true : undefined} disabled={pending}>
          {statusOptions.map((option) => (
            <option key={option} value={option}>{PROJECT_STATUS_LABELS[option]}</option>
          ))}
        </select>
        <ProjectFieldError id="review-status-error" error={statusError} />
      </div>
      <fieldset className="space-y-2" aria-describedby={projectClassError ? "review-project-class-error" : undefined} aria-invalid={projectClassError ? true : undefined}>
        <legend className="text-sm font-medium">Projektklasse</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {PROJECT_CLASSES.map((value) => (
            <label key={value} className="rounded border p-3 text-sm">
              <input className="mr-2" type="radio" name="project_class" value={value} defaultChecked={projectClass === value} disabled={pending} required />
              <span className="font-medium">{value} – {PROJECT_CLASS_LABELS[value]}</span>
              <span className="mt-1 block text-slate-600">{PROJECT_CLASS_DESCRIPTIONS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <ProjectFieldError id="review-project-class-error" error={projectClassError} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="requires_human_review" defaultChecked={requiresHumanReview} aria-describedby={humanReviewError ? "review-human-review-error" : undefined} aria-invalid={humanReviewError ? true : undefined} disabled={pending} />
        Menschliche Prüfung erforderlich
      </label>
      <ProjectFieldError id="review-human-review-error" error={humanReviewError} />
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Prüfung speichern"}
      </button>
    </form>
  );
}
