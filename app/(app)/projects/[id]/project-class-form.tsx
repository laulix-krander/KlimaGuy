"use client";

import { useActionState } from "react";
import { updateProjectClassAction } from "@/lib/actions/projects";
import { PROJECT_CLASS_DESCRIPTIONS, PROJECT_CLASS_LABELS } from "@/lib/domain/mappers";
import { PROJECT_CLASSES, type ProjectClass } from "@/lib/domain/types";
import { firstProjectFieldError, ProjectFieldError, ProjectFormError } from "./project-form-errors";
import { useProjectFormReset } from "./use-project-form-reset";

type ProjectClassFormProps = {
  projectId: string;
  projectClass: ProjectClass | null;
};

const initialState = { success: false as const, error: "" };

export function ProjectClassForm({ projectId, projectClass }: ProjectClassFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectClassAction, initialState);
  const projectClassError = firstProjectFieldError(state, "project_class");
  const formRef = useProjectFormReset(state.success);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <ProjectFormError error={state.success ? undefined : state.error} />
      <fieldset className="space-y-2" aria-describedby={projectClassError ? "project-class-error" : undefined} aria-invalid={projectClassError ? true : undefined}>
        <legend className="sr-only">Projektklasse</legend>
        {PROJECT_CLASSES.map((value) => (
          <label key={value} className="block rounded border p-3 text-sm">
            <input className="mr-2" type="radio" name="project_class" value={value} defaultChecked={projectClass === value} disabled={pending} required />
            <span className="font-medium">{value} – {PROJECT_CLASS_LABELS[value]}</span>
            <span className="mt-1 block text-slate-600">{PROJECT_CLASS_DESCRIPTIONS[value]}</span>
          </label>
        ))}
      </fieldset>
      <ProjectFieldError id="project-class-error" error={projectClassError} />
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Projektklasse speichern"}
      </button>
    </form>
  );
}
