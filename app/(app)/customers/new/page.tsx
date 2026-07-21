import { Card } from "@/components/ui";
import { canCreateCustomer } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm } from "./customer-form";

export default async function NewCustomerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayCreateCustomer = parsedRole.success && canCreateCustomer(parsedRole.data);

  if (!mayCreateCustomer) {
    return (
      <Card className="space-y-3">
        <h1 className="text-3xl font-bold">Kunde anlegen</h1>
        <p>Sie dürfen keine Kunden anlegen.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Kunde anlegen</h1>
      <Card>
        <CustomerForm />
      </Card>
    </div>
  );
}
