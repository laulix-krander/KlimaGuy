"use client";

import { useActionState } from "react";
import { createProjectNoteAction } from "@/lib/actions/projects";

const initialState = { success: false as const, error: "", values: { content: "" } };

export function ProjectNoteForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createProjectNoteAction, initialState);
  const contentError = state.success === false ? state.fieldErrors?.content?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      {state.success === false && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      ) : null}
      <div>
        <label className="block text-sm font-medium" htmlFor="content">Notiz</label>
        <textarea
          aria-describedby="content-help content-error"
          aria-invalid={contentError ? "true" : "false"}
          className="mt-1 min-h-32 w-full rounded border px-3 py-2"
          defaultValue={state.success === false ? state.values?.content ?? "" : ""}
          disabled={pending}
          id="content"
          maxLength={4000}
          name="content"
          required
        />
        <p className="mt-1 text-sm text-slate-600" id="content-help">Nur für interne Projektinformationen.</p>
        {contentError ? <p className="mt-1 text-sm text-red-700" id="content-error">{contentError}</p> : null}
      </div>
      <button className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird gespeichert …" : "Notiz hinzufügen"}
      </button>
    </form>
  );
}
