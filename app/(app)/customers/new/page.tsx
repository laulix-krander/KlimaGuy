import { redirect } from "next/navigation";
import { Card, ErrorBox } from "@/components/ui";
import { CustomerForm } from "@/components/forms";
import { createCustomer } from "@/lib/actions/customers";

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  async function action(formData: FormData) { "use server"; const result = await createCustomer(Object.fromEntries(formData)); if (!result.success) redirect(`/customers/new?error=${encodeURIComponent(result.error)}`); if (result.data) redirect(`/customers/${result.data.id}?message=${encodeURIComponent("Kunde wurde angelegt.")}`);
    redirect(`/customers?message=${encodeURIComponent("Kunde wurde angelegt.")}`); }
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Kunde anlegen</h1><ErrorBox message={error} /><Card><CustomerForm action={action} submitLabel="Kunde speichern" /></Card></div>;
}
