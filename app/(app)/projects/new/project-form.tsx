"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProjectAction } from "@/lib/actions/projects";
import type { ActionResult, CreatedProject } from "@/lib/actions/project-create-service";

type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

const initialState: ActionResult<CreatedProject> = { success: false, error: "" };

export function ProjectForm({ customers, selectedCustomerId, cancelHref, selectionWarning }: { customers: CustomerOption[]; selectedCustomerId?: string; cancelHref: string; selectionWarning?: string }) {
  const [state, formAction, isPending] = useActionState(createProjectAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {selectionWarning ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
          {selectionWarning}
        </div>
      ) : null}
      {!state.success && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block font-medium" htmlFor="customer_id">Kunde</label>
        <select id="customer_id" name="customer_id" defaultValue={selectedCustomerId ?? ""} required className="w-full rounded border p-2">
          <option value="">Kunde auswählen</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.first_name} {customer.last_name}{customer.email ? ` (${customer.email})` : ""}
            </option>
          ))}
        </select>
        {!state.success && state.fieldErrors?.customer_id ? <p className="mt-1 text-sm text-red-700">{state.fieldErrors.customer_id.join(" ")}</p> : null}
      </div>

      <div>
        <label className="mb-1 block font-medium" htmlFor="title">Projektbezeichnung</label>
        <input id="title" name="title" required autoComplete="off" className="w-full rounded border p-2" />
        {!state.success && state.fieldErrors?.title ? <p className="mt-1 text-sm text-red-700">{state.fieldErrors.title.join(" ")}</p> : null}
      </div>

      <div>
        <label className="mb-1 block font-medium" htmlFor="summary">Interne Zusammenfassung</label>
        <textarea id="summary" name="summary" rows={5} className="w-full rounded border p-2" />
        {!state.success && state.fieldErrors?.summary ? <p className="mt-1 text-sm text-red-700">{state.fieldErrors.summary.join(" ")}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={isPending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70">
          {isPending ? "Wird gespeichert …" : "Speichern"}
        </button>
        <Link className="rounded-lg border px-4 py-2 font-medium hover:bg-slate-50" href={cancelHref}>Abbrechen</Link>
      </div>
    </form>
  );
}
