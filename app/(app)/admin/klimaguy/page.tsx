import { notFound } from "next/navigation";
import { canManageKlimaGuyOperations, canViewKlimaGuyOperations } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { loadEffectiveKlimaGuySettings } from "@/lib/server/klimaguy-agent-settings-service";
import { createClient } from "@/lib/supabase/server";
import { KlimaGuyOperationsForm } from "./operations-form";

export default async function KlimaGuyOperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success || !canViewKlimaGuyOperations(role.data)) notFound();
  const effective = await loadEffectiveKlimaGuySettings({ read: async () => {
    const { data, error } = await supabase.from("klimaguy_agent_settings").select("*").maybeSingle();
    if (error) throw error;
    return data;
  } });
  return <KlimaGuyOperationsForm effective={effective} canManage={canManageKlimaGuyOperations(role.data)} />;
}
