"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateProjectCoreAction } from "@/lib/actions/projects";
import type { ActionResult } from "@/lib/actions/project-create-service";
import type { UpdatedProject } from "@/lib/actions/project-update-service";
import { optionalFormValue } from "@/lib/domain/display";
import { firstProjectFieldError, ProjectFieldError, ProjectFormError } from "../project-form-errors";

type ProjectEditFormProps = {
  project: {
    id: string;
    title: string;
    installation_address: string | null;
    postal_code: string | null;
    city: string | null;
  };
};

const initialState: ActionResult<UpdatedProject> = { success: false, error: "" };

export function ProjectEditForm({ project }: ProjectEditFormProps) {
  const [state, formAction, isPending] = useActionState(updateProjectCoreAction, initialState);

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-4" noValidate>
      <input type="hidden" name="project_id" value={project.id} />
      <ProjectFormError error={state.success ? undefined : state.error} />

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="title">Projektbezeichnung</label>
        <input id="title" name="title" required defaultValue={project.title} className="w-full rounded border p-2" aria-describedby={firstProjectFieldError(state, "title") ? "title-error" : undefined} aria-invalid={firstProjectFieldError(state, "title") ? true : undefined} disabled={isPending} />
        <ProjectFieldError id="title-error" error={firstProjectFieldError(state, "title")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block font-medium" htmlFor="installation_address">Installationsadresse</label>
          <input id="installation_address" name="installation_address" defaultValue={optionalFormValue(project.installation_address)} className="w-full rounded border p-2" aria-describedby={firstProjectFieldError(state, "installation_address") ? "installation_address-error" : undefined} aria-invalid={firstProjectFieldError(state, "installation_address") ? true : undefined} disabled={isPending} />
          <ProjectFieldError id="installation_address-error" error={firstProjectFieldError(state, "installation_address")} />
        </div>
        <div className="space-y-1">
          <label className="block font-medium" htmlFor="postal_code">Postleitzahl</label>
          <input id="postal_code" name="postal_code" autoComplete="postal-code" defaultValue={optionalFormValue(project.postal_code)} className="w-full rounded border p-2" aria-describedby={firstProjectFieldError(state, "postal_code") ? "postal_code-error" : undefined} aria-invalid={firstProjectFieldError(state, "postal_code") ? true : undefined} disabled={isPending} />
          <ProjectFieldError id="postal_code-error" error={firstProjectFieldError(state, "postal_code")} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="city">Ort</label>
        <input id="city" name="city" autoComplete="address-level2" defaultValue={optionalFormValue(project.city)} className="w-full rounded border p-2" aria-describedby={firstProjectFieldError(state, "city") ? "city-error" : undefined} aria-invalid={firstProjectFieldError(state, "city") ? true : undefined} disabled={isPending} />
        <ProjectFieldError id="city-error" error={firstProjectFieldError(state, "city")} />
      </div>


      <div className="flex gap-3">
        <Button type="submit" aria-disabled={isPending} className="disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending}>{isPending ? "Wird gespeichert …" : "Änderungen speichern"}</Button>
        <Link className="rounded-lg border px-4 py-2 font-medium text-slate-700" href={`/projects/${project.id}`}>Abbrechen</Link>
      </div>
    </form>
  );
}
