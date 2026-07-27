"use client";

import React, { FormEvent, useRef, useState } from "react";
import { finalizeProjectMediaUploadAction } from "@/lib/actions/project-media-upload-finalization";
import { reserveProjectMediaUploadAction } from "@/lib/actions/project-media-upload-reservation";
import { uploadReservedProjectMediaAction } from "@/lib/actions/project-media-storage-upload";
import { PROJECT_MEDIA_CATEGORY_LABELS, type ProjectMediaCategory } from "@/lib/domain/mappers";
import { PROJECT_MEDIA_CATEGORIES, PROJECT_MEDIA_MIME_TYPES } from "@/lib/domain/schemas";
import { ProjectFieldError, ProjectFormError } from "./project-form-errors";

export const PROJECT_MEDIA_ACCEPT = PROJECT_MEDIA_MIME_TYPES.join(",");
export const PROJECT_MEDIA_DEFAULT_CATEGORY: ProjectMediaCategory = "other";
export const PROJECT_MEDIA_IMAGE_MAX_BYTES = 15_000_000;
export const PROJECT_MEDIA_PDF_MAX_BYTES = 25_000_000;

type FieldErrors = { file?: string; category?: string };

export function validateProjectMediaSelection(file: File | null, category: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!file) errors.file = "Bitte wählen Sie eine Datei aus.";
  else if (file.size === 0) errors.file = "Die Datei darf nicht leer sein.";
  else if (!PROJECT_MEDIA_MIME_TYPES.some((mime) => mime === file.type)) errors.file = "Dieser Dateityp wird nicht unterstützt.";
  else if (file.size > (file.type === "application/pdf" ? PROJECT_MEDIA_PDF_MAX_BYTES : PROJECT_MEDIA_IMAGE_MAX_BYTES)) {
    errors.file = "Die Datei überschreitet die zulässige Größe.";
  }
  if (!PROJECT_MEDIA_CATEGORIES.some((value) => value === category)) errors.category = "Bitte wählen Sie eine Kategorie aus.";
  return errors;
}

export function ProjectMediaUploadForm({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const formData = new FormData(event.currentTarget);
    const file = selectedFile;
    const category = String(formData.get("category") ?? "");
    const validationErrors = validateProjectMediaSelection(file, category);
    setFieldErrors(validationErrors);
    setError(undefined);
    setSuccess(undefined);
    if (Object.keys(validationErrors).length > 0 || !file) {
      queueMicrotask(() => feedbackRef.current?.focus());
      return;
    }

    submittingRef.current = true;
    setPending(true);
    try {
      const reservation = await reserveProjectMediaUploadAction({
        project_id: projectId,
        original_filename: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        category,
        source: "manual_upload",
      });
      if (!reservation.success) {
        setError(reservation.error || "Der Upload konnte nicht reserviert werden.");
        return;
      }

      const uploadData = new FormData();
      uploadData.set("media_id", reservation.data.media_id);
      uploadData.set("project_id", projectId);
      uploadData.set("file", file);
      const upload = await uploadReservedProjectMediaAction(uploadData);
      if (!upload.success) {
        setError(upload.error || "Die Datei konnte nicht hochgeladen werden.");
        return;
      }

      const finalization = await finalizeProjectMediaUploadAction({ media_id: reservation.data.media_id, project_id: projectId });
      if (!finalization.success) {
        setError(finalization.error || "Der Upload konnte nicht abgeschlossen werden.");
        return;
      }

      formRef.current?.reset();
      setSelectedFile(null);
      setFieldErrors({});
      setError(undefined);
      setSuccess("Die Datei wurde erfolgreich hochgeladen.");
    } catch {
      setError("Die Datei konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      submittingRef.current = false;
      setPending(false);
      queueMicrotask(() => feedbackRef.current?.focus());
    }
  }

  return (
    <form ref={formRef} aria-busy={pending} className="space-y-4" onSubmit={handleSubmit}>
      <div ref={feedbackRef} tabIndex={-1}>
        <ProjectFormError error={error} />
        {success ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{success}</div> : null}
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="project-media-file">Datei</label>
        <input
          accept={PROJECT_MEDIA_ACCEPT}
          aria-describedby={fieldErrors.file ? "project-media-file-error" : "project-media-file-help"}
          aria-invalid={fieldErrors.file ? true : undefined}
          className="block w-full rounded border px-3 py-2 text-sm"
          disabled={pending}
          id="project-media-file"
          name="file"
          onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
          type="file"
        />
        <p className="text-sm text-slate-600" id="project-media-file-help">JPEG, PNG oder WebP bis 15 MB; PDF bis 25 MB.</p>
        <ProjectFieldError error={fieldErrors.file} id="project-media-file-error" />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="project-media-category">Primärkategorie</label>
        <select
          aria-describedby={fieldErrors.category ? "project-media-category-error" : undefined}
          aria-invalid={fieldErrors.category ? true : undefined}
          className="w-full rounded border px-3 py-2"
          defaultValue={PROJECT_MEDIA_DEFAULT_CATEGORY}
          disabled={pending}
          id="project-media-category"
          name="category"
        >
          {PROJECT_MEDIA_CATEGORIES.map((category) => <option key={category} value={category}>{PROJECT_MEDIA_CATEGORY_LABELS[category]}</option>)}
        </select>
        <ProjectFieldError error={fieldErrors.category} id="project-media-category-error" />
      </div>
      <button aria-disabled={pending} className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Wird hochgeladen …" : "Datei hochladen"}
      </button>
    </form>
  );
}
