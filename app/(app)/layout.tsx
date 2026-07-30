import { Nav } from "@/components/ui";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);

  return <><Nav role={parsedRole.success ? parsedRole.data : null} /><main className="mx-auto max-w-6xl px-4 py-8">{children}</main></>;
}
