"use client";

import { useState, useTransition } from "react";
import { commitTestCustomerReset, previewTestCustomerReset } from "@/lib/actions/test-customer-reset";
import type { TestCustomerResetResult } from "@/lib/actions/test-customer-reset-service";
import { Button, Card } from "@/components/ui";

export function TestCustomerResetOperator() {
  const [senderScope, setSenderScope] = useState("");
  const [externalIdentity, setExternalIdentity] = useState("");
  const [result, setResult] = useState<TestCustomerResetResult | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = result?.success && result.phase === "preview" ? result : null;
  const input = { sender_scope: senderScope, external_identity: externalIdentity };

  function runPreview() { startTransition(async () => setResult(await previewTestCustomerReset(input))); }
  function runCommit() {
    if (!preview) return;
    startTransition(async () => setResult(await commitTestCustomerReset({ ...input, preview_receipt: preview.preview_receipt })));
  }

  return <div className="space-y-6">
    <header><h1 className="text-3xl font-bold">Testkunden-Lifecycle zurücksetzen</h1><p className="mt-2 text-slate-700">Der Operator schließt ausschließlich die aktuelle Unterhaltung. Kunde, Projekt, Nachrichten und WhatsApp-Historie bleiben erhalten.</p></header>
    <Card>
      <form action={runPreview} className="space-y-4">
        <div><label className="block font-medium" htmlFor="sender-scope">Sender Scope</label><input className="mt-1 w-full rounded border p-2" id="sender-scope" maxLength={255} onChange={(event) => { setSenderScope(event.target.value); setResult(null); }} required value={senderScope} /></div>
        <div><label className="block font-medium" htmlFor="external-identity">Externe Testidentität</label><input autoComplete="off" className="mt-1 w-full rounded border p-2" id="external-identity" maxLength={255} onChange={(event) => { setExternalIdentity(event.target.value); setResult(null); }} required value={externalIdentity} /></div>
        <Button disabled={pending} type="submit">{pending ? "Wird geprüft …" : "Aktuellen Lifecycle prüfen"}</Button>
      </form>
    </Card>
    {result && !result.success ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-900">{result.error}</p> : null}
    {result?.success ? <Card><h2 className="text-xl font-bold">{result.phase === "preview" ? "Vorschau" : "Reset erfolgreich"}</h2>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-slate-600">Conversation</dt><dd className="font-mono text-sm">{result.lifecycle.conversation_id ?? "Keine aktive Bindung"}</dd></div>
        <div><dt className="text-slate-600">Status</dt><dd className="font-semibold">{result.lifecycle.conversation_status ?? "Keine Unterhaltung"}</dd></div>
        <div><dt className="text-slate-600">Conversation-Revision</dt><dd>{result.lifecycle.conversation_revision ?? "–"}</dd></div>
        <div><dt className="text-slate-600">Binding-Revision</dt><dd>{result.lifecycle.binding_revision ?? "–"}</dd></div>
      </dl>
      {result.phase === "preview" ? <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4"><p className="font-semibold">Beim Bestätigen wird genau diese aktuelle Unterhaltung geschlossen.</p><p className="mt-1">Es werden keine Kunden-, Projekt-, Nachrichten- oder Empfangsdaten gelöscht.</p><Button className="mt-3" disabled={pending} onClick={runCommit} type="button">Aktuelle Unterhaltung schließen</Button></div> : <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold">{result.closed ? "Die aktuelle Unterhaltung wurde geschlossen." : "Es gab keine offene Unterhaltung mehr."}</p><p>Die gesamte Historie bleibt erhalten. Die nächste <strong>neue WhatsApp-Nachricht</strong> startet über den bestehenden Eingangspfad eine neue Unterhaltung und ein neues Projekt.</p></div>}
    </Card> : null}
  </div>;
}
