"use server";

import { revalidatePath } from "next/cache";
import { noteUpdateSchema, projectNoteSchema } from "@/lib/domain/schemas";
import { canEditNote } from "@/lib/domain/permissions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditEvent } from "./audit";
import { getCurrentUser } from "./auth";
import type { ActionResult } from "./types";

type NoteRow = { id: string; project_id: string; created_by: string };

export async function createProjectNote(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  const parsed = projectNoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Notiz.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_notes").insert({ ...parsed.data, created_by: user.id }).select("id").single();
  if (error || !data) return { success: false, error: "Die Notiz konnte nicht gespeichert werden." };
  const id = String(data.id);
  await writeAuditEvent({ actorId: user.id, entityType: "project_note", entityId: id, action: "project_note.created", metadata: { description: "Notiz angelegt" } });
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { success: true, data: { id } };
}

export async function updateProjectNote(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  const parsed = noteUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Notiz.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data: note } = await supabase.from("project_notes").select("id,project_id,created_by").eq("id", parsed.data.id).is("deleted_at", null).single();
  if (!note) return { success: false, error: "Die Notiz wurde nicht gefunden." };
  const row = note as NoteRow;
  if (!canEditNote(user.role, row.created_by, user.id)) return { success: false, error: "Sie dürfen diese Notiz nicht bearbeiten." };
  const { error } = await supabase.from("project_notes").update({ content: parsed.data.content }).eq("id", parsed.data.id);
  if (error) return { success: false, error: "Die Notiz konnte nicht aktualisiert werden." };
  await writeAuditEvent({ actorId: user.id, entityType: "project_note", entityId: parsed.data.id, action: "project_note.updated", metadata: { changed_fields: ["content"] } });
  revalidatePath(`/projects/${row.project_id}`);
  return { success: true };
}

export async function softDeleteProjectNote(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  const supabase = await createClient();
  const { data: note } = await supabase.from("project_notes").select("id,project_id,created_by").eq("id", id).is("deleted_at", null).single();
  if (!note) return { success: false, error: "Die Notiz wurde nicht gefunden." };
  const row = note as NoteRow;
  if (!canEditNote(user.role, row.created_by, user.id)) return { success: false, error: "Sie dürfen diese Notiz nicht löschen." };
  const { error } = await supabase.from("project_notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { success: false, error: "Die Notiz konnte nicht gelöscht werden." };
  await writeAuditEvent({ actorId: user.id, entityType: "project_note", entityId: id, action: "project_note.soft_deleted", metadata: { description: "Notiz soft gelöscht" } });
  revalidatePath(`/projects/${row.project_id}`);
  return { success: true };
}
