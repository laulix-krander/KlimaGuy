"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateCustomerAction } from "@/lib/actions/customers";
import type { ActionResult } from "@/lib/actions/customer-create-service";
import type { UpdatedCustomer } from "@/lib/actions/customer-update-service";
import { optionalFormValue } from "@/lib/domain/display";

type CustomerEditFormProps = {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
};

const initialState: ActionResult<UpdatedCustomer> = { success: false, error: "" };

function firstFieldError(state: ActionResult<UpdatedCustomer>, field: string): string | undefined {
  return state.success ? undefined : state.fieldErrors?.[field]?.[0];
}

export function CustomerEditForm({ customer }: CustomerEditFormProps) {
  const [state, formAction, isPending] = useActionState(updateCustomerAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2" noValidate>
      <input type="hidden" name="customer_id" value={customer.id} />
      {!state.success && state.error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 md:col-span-2" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="first_name">Vorname</label>
        <input id="first_name" name="first_name" autoComplete="given-name" required defaultValue={customer.first_name} className="w-full rounded border p-2" aria-describedby="first_name-error" />
        <p id="first_name-error" className="text-sm text-red-700">{firstFieldError(state, "first_name")}</p>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="last_name">Nachname</label>
        <input id="last_name" name="last_name" autoComplete="family-name" required defaultValue={customer.last_name} className="w-full rounded border p-2" aria-describedby="last_name-error" />
        <p id="last_name-error" className="text-sm text-red-700">{firstFieldError(state, "last_name")}</p>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="email">E-Mail</label>
        <input id="email" name="email" type="email" autoComplete="email" defaultValue={optionalFormValue(customer.email)} className="w-full rounded border p-2" aria-describedby="email-error" />
        <p id="email-error" className="text-sm text-red-700">{firstFieldError(state, "email")}</p>
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="phone">Telefon</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={optionalFormValue(customer.phone)} className="w-full rounded border p-2" aria-describedby="phone-error" />
        <p id="phone-error" className="text-sm text-red-700">{firstFieldError(state, "phone")}</p>
      </div>

      <div className="flex gap-3 md:col-span-2">
        <Button type="submit" disabled={isPending}>{isPending ? "Änderungen speichern …" : "Änderungen speichern"}</Button>
        <Link className="rounded-lg border px-4 py-2 font-medium text-slate-700" href={`/customers/${customer.id}`}>Abbrechen</Link>
      </div>
    </form>
  );
}
