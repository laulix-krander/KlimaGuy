import { notFound, redirect } from "next/navigation";
import { Card, ErrorBox } from "@/components/ui";
import { CustomerForm } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { updateCustomer } from "@/lib/actions/customers";

type CustomerRow = { first_name: string; last_name: string; email: string | null; phone: string | null };

export default async function EditCustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams; const supabase = await createClient(); const { data } = await supabase.from("customers").select("first_name,last_name,email,phone").eq("id", id).is("deleted_at", null).single(); if (!data) notFound();
  async function action(formData: FormData) { "use server"; const result = await updateCustomer(id, Object.fromEntries(formData)); if (!result.success) redirect(`/customers/${id}/edit?error=${encodeURIComponent(result.error)}`); redirect(`/customers/${id}?message=${encodeURIComponent("Kunde wurde aktualisiert.")}`); }
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Kunde bearbeiten</h1><ErrorBox message={error} /><Card><CustomerForm action={action} customer={data as CustomerRow} submitLabel="Änderungen speichern" /></Card></div>;
}
