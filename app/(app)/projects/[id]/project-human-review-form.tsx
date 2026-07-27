"use client";

import { useActionState } from "react";
import { updateProjectHumanReviewAction } from "@/lib/actions/projects";
import { firstProjectFieldError, ProjectFieldError, ProjectFormError } from "./project-form-errors";
import { useProjectFormReset } from "./use-project-form-reset";

type ProjectHumanReviewFormProps = {
  projectId: string;
  requiresHumanReview: boolean;
};

const initialState = { success: false as const, error: "" };

export function ProjectHumanReviewForm({ projectId, requiresHumanReview }: ProjectHumanReviewFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectHumanReviewAction, initialState);
  const humanReviewError = firstProjectFieldError(state, "requires_human_review");
  const formRef = useProjectFormReset(state.success);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <ProjectFormError error={state.success ? undefined : state.error} />
      <fieldset className="space-y-2" aria-describedby={humanReviewError ? "human-review-error" : undefined} aria-invalid={humanReviewError ? true : undefined}>
        <legend className="sr-only">Human Review</legend>
        <label className="block rounded border p-3 text-sm">
          <input className="mr-2" type="radio" name="requires_human_review" value="true" defaultChecked={requiresHumanReview === true} disabled={pending} required />
          <span className="font-medium">Human Review erforderlich</span>
        </label>
        <label className="block rounded border p-3 text-sm">
          <input className="mr-2" type="radio" name="requires_human_review" value="false" defaultChecked={requiresHumanReview === false} disabled={pending} required />
          <span className="font-medium">Kein Human Review erforderlich</span>
        </label>
      </fieldset>
      <ProjectFieldError id="human-review-error" error={humanReviewError} />
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Human Review speichern"}
      </button>
    </form>
  );
}
