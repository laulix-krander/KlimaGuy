"use server";

import { revalidatePath } from "next/cache";
import { projectSchema, projectStatusSchema, reviewerProjectUpdateSchema } from "@/lib/domain/schemas";
import { canCreateProject, canDeleteProject, canEditProjectField, type ProjectField } from "@/lib/domain/permissions";
import { canTransitionProjectStatus } from "@/lib/domain/project-status";
import type { ProjectStatus } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { writeAuditEvent } from "./audit";
import { getCurrentUser } from "./auth";
import type { ActionResult } from "./types";

type ProjectRow = { status: ProjectStatus; project_class: string | null; requires_human_review: boolean; summary: string | null };

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  if (!canCreateProject(user.role)) return { success: false, error: "Sie dürfen keine Projekte anlegen." };

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Eingaben.", fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("id", parsed.data.customer_id).is("deleted_at", null).single();
  if (!customer) return { success: false, error: "Der gewählte Kunde ist nicht verfügbar." };

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, requires_human_review: true, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: "Das Projekt konnte nicht angelegt werden." };
  const id = String(data.id);
  await writeAuditEvent({ actorId: user.id, entityType: "project", entityId: id, action: "project.created", metadata: { description: "Projekt angelegt" } });
  revalidatePath("/projects");
  return { success: true, data: { id } };
}

export async function updateProject(id: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("projects").select("status,project_class,requires_human_review,summary").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Das Projekt wurde nicht gefunden." };
  const current = existing as ProjectRow;

  const parsed = user.role === "admin" ? projectSchema.safeParse(input) : reviewerProjectUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Eingaben.", fieldErrors: parsed.error.flatten().fieldErrors };

  if (!canTransitionProjectStatus(current.status, parsed.data.status)) {
    return { success: false, error: "Dieser Statusübergang ist nicht erlaubt." };
  }

  const changedFields = Object.keys(parsed.data).filter((field) => {
    const key = field as keyof typeof parsed.data;
    return parsed.data[key] !== current[key as keyof ProjectRow];
  });

  if (user.role !== "admin" && changedFields.some((field) => !canEditProjectField(user.role, field as ProjectField))) {
    return { success: false, error: "Sie dürfen diese Projektfelder nicht bearbeiten." };
  }

  const { error } = await supabase.from("projects").update(parsed.data).eq("id", id).is("deleted_at", null);
  if (error) return { success: false, error: "Das Projekt konnte nicht aktualisiert werden." };

  if (changedFields.includes("status")) await writeAuditEvent({ actorId: user.id, entityType: "project", entityId: id, action: "project.status_changed", metadata: { changed_fields: ["status"], from: current.status, to: parsed.data.status } });
  if (changedFields.includes("project_class")) await writeAuditEvent({ actorId: user.id, entityType: "project", entityId: id, action: "project.class_changed", metadata: { changed_fields: ["project_class"], from: current.project_class, to: parsed.data.project_class ?? null } });
  if (changedFields.includes("requires_human_review")) await writeAuditEvent({ actorId: user.id, entityType: "project", entityId: id, action: "project.review_flag_changed", metadata: { changed_fields: ["requires_human_review"], from: current.requires_human_review, to: parsed.data.requires_human_review } });
  await writeAuditEvent({ actorId: user.id, entityType: "project", entityId: id, action: "project.updated", metadata: { changed_fields: changedFields } });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { success: true };
}

export async function updateProjectStatus(id: string, status: unknown): Promise<ActionResult> {
  const parsedStatus = projectStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { success: false, error: "Ungültiger Projektstatus." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("projects").select("status,project_class,requires_human_review,summary").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Das Projekt wurde nicht gefunden." };
  const current = existing as ProjectRow;
  return updateProject(id, { status: parsedStatus.data, project_class: current.project_class, requires_human_review: current.requires_human_review, summary: current.summary });
}

export async function softDeleteProject(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  if (!canDeleteProject(user.role)) return { success: false, error: "Sie dürfen Projekte nicht löschen." };
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) return { success: false, error: "Das Projekt konnte nicht gelöscht werden." };
  await writeAuditEvent({ actorId: user.id, entityType: "project", entityId: id, action: "project.soft_deleted", metadata: { description: "Projekt soft gelöscht" } });
  revalidatePath("/projects");
  return { success: true };
}
