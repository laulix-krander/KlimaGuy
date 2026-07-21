"use server";

import { revalidatePath } from "next/cache";
import { customerSchema } from "@/lib/domain/schemas";
import { canCreateCustomer, canCustomerBeDeleted, canDeleteCustomer, canEditCustomer } from "@/lib/domain/permissions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditEvent } from "./audit";
import { getCurrentUser } from "./auth";
import type { ActionResult } from "./types";

type CustomerPayload = { first_name: string; last_name: string; email: string | null; phone: string | null };

type ActiveProjectRow = { status: string };


export async function createCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  if (!canCreateCustomer(user.role)) return { success: false, error: "Sie dürfen keine Kunden anlegen." };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Eingaben.", fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: "Der Kunde konnte nicht angelegt werden." };
  const id = String(data.id);
  await writeAuditEvent({ actorId: user.id, entityType: "customer", entityId: id, action: "customer.created", metadata: { description: "Kunde angelegt" } });
  revalidatePath("/customers");
  return { success: true, data: { id } };
}

export async function updateCustomer(id: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  if (!canEditCustomer(user.role)) return { success: false, error: "Sie dürfen Kunden nicht bearbeiten." };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Eingaben.", fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payload: CustomerPayload = parsed.data;
  const { error } = await supabase.from("customers").update(payload).eq("id", id).is("deleted_at", null);
  if (error) return { success: false, error: "Der Kunde konnte nicht aktualisiert werden." };
  await writeAuditEvent({ actorId: user.id, entityType: "customer", entityId: id, action: "customer.updated", metadata: { changed_fields: Object.keys(payload) } });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function softDeleteCustomer(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melden Sie sich erneut an." };
  if (!canDeleteCustomer(user.role)) return { success: false, error: "Sie dürfen Kunden nicht löschen." };

  const supabase = await createClient();
  const { data: projects, error: projectError } = await supabase
    .from("projects")
    .select("status")
    .eq("customer_id", id)
    .is("deleted_at", null);

  if (projectError) return { success: false, error: "Die aktiven Projekte konnten nicht geprüft werden." };
  const statuses = ((projects ?? []) as ActiveProjectRow[]).map((project) => project.status);
  if (!canCustomerBeDeleted(statuses)) return { success: false, error: "Der Kunde kann nicht gelöscht werden, solange aktive Projekte vorhanden sind." };

  const { error } = await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) return { success: false, error: "Der Kunde konnte nicht gelöscht werden." };
  await writeAuditEvent({ actorId: user.id, entityType: "customer", entityId: id, action: "customer.soft_deleted", metadata: { description: "Kunde soft gelöscht" } });
  revalidatePath("/customers");
  return { success: true };
}
