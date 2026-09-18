"use server";

import { revalidatePath } from "next/cache";
import { canManageKlimaGuyOperations } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { KlimaGuySettingsConflictError, updateKlimaGuySettings } from "@/lib/server/klimaguy-agent-settings-service";
import { createClient } from "@/lib/supabase/server";
import { parseKlimaGuySettingsFormData } from "./klimaguy-agent-settings-form";

export type KlimaGuySettingsActionState = { success: boolean; message: string };

export async function updateKlimaGuySettingsAction(_state: KlimaGuySettingsActionState, formData: FormData): Promise<KlimaGuySettingsActionState> {
  const input = parseKlimaGuySettingsFormData(formData);
  if (!input.success) return { success: false, message: "Bitte prüfe die markierten Einstellungen." };
  const { expected_revision, ...settings } = input.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Der Zugriff ist nicht erlaubt." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success || !canManageKlimaGuyOperations(role.data)) return { success: false, message: "Nur Administratoren dürfen diese Konfiguration ändern." };
  try {
    await updateKlimaGuySettings({ update: async (args) => { const { data, error } = await supabase.rpc("update_klimaguy_agent_settings", args); if (error) throw error; return data; } }, settings, expected_revision);
    revalidatePath("/admin/klimaguy");
    return { success: true, message: "Konfiguration gespeichert. Neue Gespräche verwenden die Änderungen sofort." };
  } catch (error) {
    if (error instanceof KlimaGuySettingsConflictError) return { success: false, message: "Die Konfiguration wurde zwischenzeitlich geändert. Bitte lade die Seite neu und prüfe die aktuellen Werte." };
    return { success: false, message: "Die Konfiguration konnte nicht gespeichert werden." };
  }
}
