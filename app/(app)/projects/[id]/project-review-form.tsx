"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateProjectReviewAction } from "@/lib/actions/projects";
import type { ActionResult } from "@/lib/actions/project-create-service";
import type { UpdatedProjectReview } from "@/lib/actions/project-review-service";
import { projectClassToDescription, projectClassToLabel, statusToLabel } from "@/lib/domain/mappers";
import type { ProjectClass, ProjectStatus } from "@/lib/domain/types";

type ProjectReviewFormProps = {
  project: {
    id: string;
    status: ProjectStatus;
    project_class: ProjectClass | null;
    requires_human_review: boolean;
  };
  allowedTargetStatuses: readonly ProjectStatus[];
};

const projectClasses: readonly ProjectClass[] = ["A", "B", "C", "D"];
const initialState: ActionResult<UpdatedProjectReview> = { success: false, error: "" };

function firstFieldError(state: ActionResult<UpdatedProjectReview>, field: string): string | undefined {
  return state.success ? undefined : state.fieldErrors?.[field]?.[0];
}

export function ProjectReviewForm({ project, allowedTargetStatuses }: ProjectReviewFormProps) {
  const [state, formAction, isPending] = useActionState(updateProjectReviewAction, initialState);
  const statusOptions = [project.status, ...allowedTargetStatuses];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="project_id" value={project.id} />
      {!state.success && state.error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{state.error}</div> : null}

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="review-status">Projektstatus</label>
        <select id="review-status" name="status" defaultValue={project.status} disabled={allowedTargetStatuses.length === 0} className="w-full rounded border p-2" aria-describedby="review-status-error">
          {statusOptions.map((status) => <option key={status} value={status}>{statusToLabel(status)}</option>)}
        </select>
        {allowedTargetStatuses.length === 0 ? <input type="hidden" name="status" value={project.status} /> : null}
        <p id="review-status-error" className="text-sm text-red-700">{firstFieldError(state, "status")}</p>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="review-project-class">Projektklasse</label>
        <select id="review-project-class" name="project_class" required defaultValue={project.project_class ?? ""} className="w-full rounded border p-2" aria-describedby="review-project-class-error">
          <option value="" disabled>Bitte auswählen</option>
          {projectClasses.map((projectClass) => (
            <option key={projectClass} value={projectClass}>{projectClass} – {projectClassToLabel(projectClass)}</option>
          ))}
        </select>
        <p className="text-sm text-slate-600">{projectClasses.map((projectClass) => `${projectClass}: ${projectClassToDescription(projectClass)}`).join(" ")}</p>
        <p id="review-project-class-error" className="text-sm text-red-700">{firstFieldError(state, "project_class")}</p>
      </div>

      <label className="flex items-center gap-2 font-medium" htmlFor="review-human-review">
        <input id="review-human-review" name="requires_human_review" type="checkbox" defaultChecked={project.requires_human_review} className="h-4 w-4 rounded border" />
        Menschliche Prüfung erforderlich
      </label>
      <p className="text-sm text-red-700">{firstFieldError(state, "requires_human_review")}</p>

      <Button type="submit" disabled={isPending}>{isPending ? "Wird gespeichert …" : "Prüfung speichern"}</Button>
    </form>
  );
}
