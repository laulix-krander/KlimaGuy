"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateProjectCoreAction } from "@/lib/actions/projects";
import type { ActionResult } from "@/lib/actions/project-create-service";
import type { UpdatedProject } from "@/lib/actions/project-update-service";
import { optionalFormValue } from "@/lib/domain/display";

type ProjectEditFormProps = {
  project: {
    id: string;
    title: string;
    installation_address: string | null;
    postal_code: string | null;
    city: string | null;
    summary: string | null;
  };
};

const initialState: ActionResult<UpdatedProject> = { success: false, error: "" };

function firstFieldError(state: ActionResult<UpdatedProject>, field: string): string | undefined {
  return state.success ? undefined : state.fieldErrors?.[field]?.[0];
}

export function ProjectEditForm({ project }: ProjectEditFormProps) {
  const [state, formAction, isPending] = useActionState(updateProjectCoreAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="project_id" value={project.id} />
      {!state.success && state.error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{state.error}</div> : null}

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="title">Projektbezeichnung</label>
        <input id="title" name="title" required defaultValue={project.title} className="w-full rounded border p-2" aria-describedby="title-error" />
        <p id="title-error" className="text-sm text-red-700">{firstFieldError(state, "title")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block font-medium" htmlFor="installation_address">Installationsadresse</label>
          <input id="installation_address" name="installation_address" defaultValue={optionalFormValue(project.installation_address)} className="w-full rounded border p-2" aria-describedby="installation_address-error" />
          <p id="installation_address-error" className="text-sm text-red-700">{firstFieldError(state, "installation_address")}</p>
        </div>
        <div className="space-y-1">
          <label className="block font-medium" htmlFor="postal_code">Postleitzahl</label>
          <input id="postal_code" name="postal_code" autoComplete="postal-code" defaultValue={optionalFormValue(project.postal_code)} className="w-full rounded border p-2" aria-describedby="postal_code-error" />
          <p id="postal_code-error" className="text-sm text-red-700">{firstFieldError(state, "postal_code")}</p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="city">Ort</label>
        <input id="city" name="city" autoComplete="address-level2" defaultValue={optionalFormValue(project.city)} className="w-full rounded border p-2" aria-describedby="city-error" />
        <p id="city-error" className="text-sm text-red-700">{firstFieldError(state, "city")}</p>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="summary">Interne Zusammenfassung</label>
        <textarea id="summary" name="summary" rows={5} defaultValue={optionalFormValue(project.summary)} className="w-full rounded border p-2" aria-describedby="summary-error" />
        <p id="summary-error" className="text-sm text-red-700">{firstFieldError(state, "summary")}</p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>{isPending ? "Wird gespeichert …" : "Änderungen speichern"}</Button>
        <Link className="rounded-lg border px-4 py-2 font-medium text-slate-700" href={`/projects/${project.id}`}>Abbrechen</Link>
      </div>
    </form>
  );
}
