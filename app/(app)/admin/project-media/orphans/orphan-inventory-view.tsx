import Link from "next/link";
import React from "react";
import type { ProjectMediaOrphanInventoryResult } from "@/lib/actions/project-media-orphan-inventory-service";
import { OrphanClaimControl } from "./orphan-claim-control";
import { OrphanPurgeControl } from "./orphan-purge-control";

export type PurgeCandidate = { cleanup_item_id: string; media_id: string; project_id: string; project_title: string; source_upload_status: string; cleanup_status: string; purge_status: string; completed_at: string; purge_attempt_count: number; last_purge_error_code: string | null; created_at: string };

type SuccessData = Extract<ProjectMediaOrphanInventoryResult, { success: true }>['data'];

const classificationLabels = {
  pending_orphan_candidate: "Pending-Kandidat",
  failed_orphan_candidate: "Fehlgeschlagener Kandidat",
} as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "unit", unit: "byte", unitDisplay: "short", maximumFractionDigits: 0 }).format(value);
}

function pageHref(page: number, filter: SuccessData['filter']): string {
  return `/admin/project-media/orphans?page=${page}&status=${filter}`;
}

export function OrphanInventoryView({ data, canClaim = false, purgeCandidates = [] }: { data: SuccessData; canClaim?: boolean; purgeCandidates?: PurgeCandidate[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Medien-Inventur</h1>
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950" role="status">
          Die Inventur zeigt ausschließlich mindestens 24 Stunden alte Pending- und Failed-Kandidaten. Eine fachliche Bereinigung erfordert eine ausdrückliche Bestätigung.
        </p>
      </div>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1 text-sm font-medium" htmlFor="status">
            Status
            <select className="rounded border px-3 py-2 font-normal" defaultValue={data.filter} id="status" name="status">
              <option value="all">Alle</option>
              <option value="pending">Pending</option>
              <option value="failed">Fehlgeschlagen</option>
            </select>
          </label>
          <input name="page" type="hidden" value="1" />
          <button className="rounded border px-4 py-2 font-medium hover:bg-slate-50" type="submit">Anzeigen</button>
          <p className="text-sm text-slate-600">Mindestalter: fest 24 Stunden · maximal 50 Einträge pro Seite</p>
        </form>
      </section>

      {canClaim ? <section className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Fachlich bereinigt – physische Datei ausstehend</h2><p className="mt-2 text-sm text-slate-600">Nur einzeln bestätigte, bereits fachlich bereinigte Medien können endgültig entfernt werden.</p>
        {purgeCandidates.length === 0 ? <p className="mt-4 text-slate-600">Keine Purgekandidaten vorhanden.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Projekt</th><th className="p-2">Quellstatus</th><th className="p-2">Bereinigt am</th><th className="p-2">Versuche</th><th className="p-2">Aktion</th></tr></thead><tbody>{purgeCandidates.map(item => <tr className="border-b" key={item.cleanup_item_id}><td className="p-2">{item.project_title}</td><td className="p-2">{item.source_upload_status}</td><td className="p-2">{formatDate(item.completed_at)}</td><td className="p-2">{item.purge_attempt_count}</td><td className="p-2"><OrphanPurgeControl mediaId={item.media_id} projectId={item.project_id}/></td></tr>)}</tbody></table></div>}
      </section> : null}

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        {data.items.length === 0 ? (
          <p className="text-slate-600">Keine verwaisten Upload-Kandidaten gefunden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead><tr className="border-b">
                <th className="p-2">Klassifikation</th><th className="p-2">Projekt</th><th className="p-2">Status</th>
                <th className="p-2">Alter</th><th className="p-2">MIME-Type</th><th className="p-2">Dateigröße</th><th className="p-2">Erstellt am</th>{canClaim ? <th className="p-2">Aktion</th> : null}
              </tr></thead>
              <tbody>{data.items.map((item) => (
                <tr className="border-b last:border-0" key={item.media_id}>
                  <td className="p-2">{classificationLabels[item.classification]}</td>
                  <td className="p-2"><span className="font-medium">{item.project_title}</span><br /><span className="font-mono text-xs text-slate-500">{item.project_id}</span></td>
                  <td className="p-2">{item.upload_status}</td><td className="p-2">{item.age_hours} Std.</td>
                  <td className="p-2">{item.mime_type}</td><td className="p-2">{formatBytes(item.file_size_bytes)}</td><td className="p-2">{formatDate(item.created_at)}</td>
                  {canClaim ? <td className="p-2"><OrphanClaimControl mediaId={item.media_id} projectId={item.project_id} /></td> : null}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {data.total_pages > 1 ? (
        <nav aria-label="Seitennavigation" className="flex items-center justify-between">
          {data.page > 1 ? <Link className="rounded border px-3 py-2" href={pageHref(data.page - 1, data.filter)}>Vorherige Seite</Link> : <span />}
          <span className="text-sm text-slate-600">Seite {data.page} von {data.total_pages}</span>
          {data.page < data.total_pages ? <Link className="rounded border px-3 py-2" href={pageHref(data.page + 1, data.filter)}>Nächste Seite</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
