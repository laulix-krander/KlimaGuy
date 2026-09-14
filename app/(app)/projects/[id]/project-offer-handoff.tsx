import { createProjectOfferDraftAction } from "@/lib/actions/project-offers";

export function ProjectOfferHandoff({ projectId, status, mayCreate }: { projectId: string; status: "technical_review" | "human_review"; mayCreate: boolean }) {
  return <div className="rounded border border-amber-300 bg-amber-50 p-4">
    <h2 className="font-semibold">Bereit für die Angebotsprüfung</h2>
    <p className="mt-1 text-sm">Qualifikation abgeschlossen. Umfang und Preis müssen weiterhin durch einen berechtigten Menschen geprüft werden.</p>
    {mayCreate ? <form action={createProjectOfferDraftAction} className="mt-3">
      <input name="projectId" type="hidden" value={projectId} />
      <input name="expectedProjectStatus" type="hidden" value={status} />
      <button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white" type="submit">Angebotsentwurf anlegen</button>
    </form> : <p className="mt-3 text-sm font-medium">Nur Admins dürfen einen Angebotsentwurf anlegen.</p>}
  </div>;
}
