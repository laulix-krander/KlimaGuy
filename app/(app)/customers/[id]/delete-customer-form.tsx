"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { softDeleteCustomerAction } from "@/lib/actions/customers";
import type { ActionResult } from "@/lib/actions/customer-create-service";
import type { DeletedCustomer } from "@/lib/actions/customer-delete-service";

const initialState: ActionResult<DeletedCustomer> = { success: false, error: "" };

export function DeleteCustomerForm({ customerId }: { customerId: string }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(softDeleteCustomerAction, initialState);

  if (!isConfirming) {
    return (
      <div className="space-y-2">
        {!state.success && state.error ? (
          <p className="text-sm text-red-700" role="alert">{state.error}</p>
        ) : null}
        <Button type="button" className="bg-red-700 hover:bg-red-800" onClick={() => setIsConfirming(true)}>
          Kunde löschen
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <input type="hidden" name="customer_id" value={customerId} />
      <p className="text-sm text-red-950">
        Möchten Sie diesen Kunden wirklich löschen? Der Kunde wird aus der normalen Ansicht entfernt. Diese Aktion kann in der aktuellen Oberfläche nicht rückgängig gemacht werden.
      </p>
      <p className="text-sm text-red-900">Verknüpfte Projekte verhindern die Löschung.</p>
      {!state.success && state.error ? (
        <p className="text-sm font-medium text-red-800" role="alert">{state.error}</p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={isPending} className="bg-red-700 hover:bg-red-800">
          {isPending ? "Wird gelöscht …" : "Kunde löschen"}
        </Button>
        <Button type="button" disabled={isPending} className="border bg-white text-slate-700 hover:bg-slate-50" onClick={() => setIsConfirming(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
