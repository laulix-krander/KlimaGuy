"use client";

import { useActionState } from "react";
import { updateProjectClassAction } from "@/lib/actions/projects";
import { PROJECT_CLASS_DESCRIPTIONS, PROJECT_CLASS_LABELS } from "@/lib/domain/mappers";
import { PROJECT_CLASSES, type ProjectClass } from "@/lib/domain/types";

type ProjectClassFormProps = {
  projectId: string;
  projectClass: ProjectClass | null;
};

const initialState = { success: false as const, error: "" };

export function ProjectClassForm({ projectId, projectClass }: ProjectClassFormProps) {
  const [state, formAction, pending] = useActionState(updateProjectClassAction, initialState);

  return (
    <form action={formAction} aria-busy={pending} className="mt-2 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {state.success === false && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="sr-only">Projektklasse</legend>
        {PROJECT_CLASSES.map((value) => (
          <label key={value} className="block rounded border p-3 text-sm">
            <input className="mr-2" type="radio" name="project_class" value={value} defaultChecked={projectClass === value} disabled={pending} required />
            <span className="font-medium">{value} – {PROJECT_CLASS_LABELS[value]}</span>
            <span className="mt-1 block text-slate-600">{PROJECT_CLASS_DESCRIPTIONS[value]}</span>
          </label>
        ))}
      </fieldset>
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Projektklasse speichern"}
      </button>
    </form>
  );
}
