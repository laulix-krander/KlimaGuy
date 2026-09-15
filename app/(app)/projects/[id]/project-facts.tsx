import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";
import { mapFactDisplay } from "@/lib/domain/project-operations-read-model";
import React from "react";

export function ProjectFacts({ facts }: { facts: readonly MvpProjectFact[] }) {
  const items = mapFactDisplay(facts); const groups = [...new Set(items.map((item) => item.group))];
  return <section aria-labelledby="facts-title" className="space-y-5" id="angaben"><div><h2 className="text-xl font-semibold" id="facts-title">Angaben &amp; Fakten</h2><p className="text-sm text-slate-600">Aktuelle kanonische Projektfakten. Unbekannte Werte werden ausdrücklich gekennzeichnet.</p></div><div className="grid gap-4 lg:grid-cols-2">{groups.map((group) => <div className="rounded-xl border p-5" key={group}><h3 className="mb-4 font-semibold text-slate-900">{group}</h3><dl className="space-y-3">{items.filter((item) => item.group === group).map((item) => <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-b border-slate-100 pb-2 last:border-0" key={item.key}><dt className="text-sm text-slate-600">{item.label}</dt><dd className={`text-sm font-medium ${item.known ? "text-slate-900" : "text-slate-400"}`}>{item.value}</dd></div>)}</dl></div>)}</div></section>;
}
