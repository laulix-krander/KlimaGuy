"use client";

import { useState, useTransition } from "react";
import { commitTestCustomerReset, previewTestCustomerReset } from "@/lib/actions/test-customer-reset";
import type { TestCustomerResetCounts, TestCustomerResetResult } from "@/lib/actions/test-customer-reset-service";
import { Button, Card } from "@/components/ui";

const countLabels: Record<Exclude<keyof TestCustomerResetCounts, "dry_run">, string> = {
  customers: "Kunden", conversations: "Unterhaltungen", projects: "Projekte", messages: "Nachrichten",
  runtime_states: "Runtime-States", pending_interactions: "Ausstehende Interaktionen", snapshots: "Snapshots",
  cycle_commands: "Cycle Commands", ai_results: "KI-Ergebnisse", answer_contexts: "Antwortkontexte",
  provider_receipts_retained: "Beibehaltene Provider-Receipts",
};
const countKeys = Object.keys(countLabels) as Array<keyof typeof countLabels>;

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
    <header><h1 className="text-3xl font-bold">Sicherer Testkunden-Reset</h1><p className="mt-2 text-slate-700">Dieser Operator ruft ausschließlich den D-23-Reset für WhatsApp auf. Erst prüfen, dann bewusst zurücksetzen.</p></header>
    <Card>
      <form action={runPreview} className="space-y-4">
        <div><label className="block font-medium" htmlFor="sender-scope">Sender Scope</label><input className="mt-1 w-full rounded border p-2" id="sender-scope" maxLength={255} onChange={(event) => { setSenderScope(event.target.value); setResult(null); }} required value={senderScope} /></div>
        <div><label className="block font-medium" htmlFor="external-identity">Externe Testidentität</label><input autoComplete="off" className="mt-1 w-full rounded border p-2" id="external-identity" maxLength={255} onChange={(event) => { setExternalIdentity(event.target.value); setResult(null); }} required value={externalIdentity} /></div>
        <Button disabled={pending} type="submit">{pending ? "Wird geprüft …" : "Vorschau ausführen"}</Button>
      </form>
    </Card>
    {result && !result.success ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-900">{result.error}</p> : null}
    {result?.success ? <Card><h2 className="text-xl font-bold">{result.phase === "preview" ? "Vorschau erfolgreich" : "Reset erfolgreich"}</h2>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">{countKeys.map((key) => <div className="flex justify-between gap-4 border-b py-1" key={key}><dt>{countLabels[key]}</dt><dd className="font-semibold">{Number(result.counts[key])}</dd></div>)}</dl>
      {result.phase === "preview" ? <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4"><p className="font-semibold">Der nächste Schritt löscht die angezeigten Testdaten endgültig.</p><Button className="mt-3 bg-red-700 hover:bg-red-800" disabled={pending} onClick={runCommit} type="button">Testkunden jetzt endgültig zurücksetzen</Button></div> : <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold">Reset erfolgreich.</p><p>Keine alte WhatsApp-Nachricht erneut senden. Sende als Nächstes eine <strong>komplett neue WhatsApp-Nachricht</strong> von derselben Testnummer.</p></div>}
    </Card> : null}
  </div>;
}
