import { notFound } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui";
import { canEditCustomer } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { CustomerEditForm } from "./customer-edit-form";

const customerIdSchema = z.string().uuid();

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = customerIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayEditCustomer = parsedRole.success && canEditCustomer(parsedRole.data);

  const { data: customer } = await supabase
    .from("customers")
    .select("id,first_name,last_name,email,phone")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (!customer) {
    notFound();
  }

  if (!mayEditCustomer) {
    return (
      <Card className="space-y-3">
        <h1 className="text-3xl font-bold">Kunde bearbeiten</h1>
        <p>Sie dürfen diesen Kunden nicht bearbeiten.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Kunde bearbeiten</h1>
      <Card>
        <CustomerEditForm customer={customer} />
      </Card>
    </div>
  );
}
