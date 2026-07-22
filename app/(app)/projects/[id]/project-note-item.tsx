"use client";

import { useState, useActionState } from "react";
import { softDeleteProjectNoteAction, updateProjectNoteAction } from "@/lib/actions/projects";

type ProjectNoteItemProps = {
  noteId: string;
  projectId: string;
  content: string;
  meta: string;
  canEdit: boolean;
  canDelete: boolean;
};

const initialUpdateState = { success: false as const, error: "", values: { content: "" } };
const initialDeleteState = { success: false as const, error: "" };

export function ProjectNoteItem({ noteId, projectId, content, meta, canEdit, canDelete }: ProjectNoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateProjectNoteAction, initialUpdateState);
  const [deleteState, deleteAction, deletePending] = useActionState(softDeleteProjectNoteAction, initialDeleteState);
  const contentError = updateState.success === false ? updateState.fieldErrors?.content?.[0] : undefined;
  const editableContent = updateState.success === false ? updateState.values?.content || content : content;

  return (
    <li className="rounded-lg border bg-slate-50 p-4">
      {editing ? (
        <form action={updateAction} className="space-y-3">
          <input type="hidden" name="note_id" value={noteId} />
          <input type="hidden" name="project_id" value={projectId} />
          {updateState.success === false && updateState.error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{updateState.error}</div>
          ) : null}
          <div>
            <label className="sr-only" htmlFor={`note-content-${noteId}`}>Notiz</label>
            <textarea
              aria-invalid={contentError ? "true" : "false"}
              className="min-h-28 w-full rounded border px-3 py-2 text-sm"
              defaultValue={editableContent}
              disabled={updatePending}
              id={`note-content-${noteId}`}
              maxLength={4000}
              name="content"
              required
            />
            {contentError ? <p className="mt-1 text-sm text-red-700">{contentError}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={updatePending} type="submit">
              {updatePending ? "Wird gespeichert …" : "Änderungen speichern"}
            </button>
            <button className="rounded border px-3 py-2 text-sm font-medium" disabled={updatePending} onClick={() => setEditing(false)} type="button">Abbrechen</button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm text-slate-900">{content}</p>
          <p className="mt-3 text-xs text-slate-600">{meta}</p>
        </>
      )}
      {!editing && (canEdit || canDelete) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canEdit ? <button className="text-sm font-medium text-teal-700 underline-offset-2 hover:underline" onClick={() => setEditing(true)} type="button">Bearbeiten</button> : null}
          {canDelete ? <button className="text-sm font-medium text-red-700 underline-offset-2 hover:underline" onClick={() => setConfirmingDelete(true)} type="button">Löschen</button> : null}
        </div>
      ) : null}
      {confirmingDelete ? (
        <form action={deleteAction} className="mt-4 rounded border border-red-200 bg-red-50 p-3">
          <input type="hidden" name="note_id" value={noteId} />
          <input type="hidden" name="project_id" value={projectId} />
          {deleteState.success === false && deleteState.error ? <div className="mb-2 text-sm text-red-800" role="alert">{deleteState.error}</div> : null}
          <p className="text-sm text-red-900">Möchten Sie diese Notiz wirklich löschen? Sie wird aus der normalen Ansicht entfernt und kann in der aktuellen Oberfläche nicht wiederhergestellt werden.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={deletePending} type="submit">
              {deletePending ? "Wird gelöscht …" : "Notiz löschen"}
            </button>
            <button className="rounded border bg-white px-3 py-2 text-sm font-medium" disabled={deletePending} onClick={() => setConfirmingDelete(false)} type="button">Abbrechen</button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
