import { redirect } from "next/navigation";
import { ConversationSimulator } from "./simulator-view";
import { canUseConversationSimulator } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationSimulatorPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success || !canUseConversationSimulator(role.data)) redirect("/dashboard");
  return <ConversationSimulator />;
}
