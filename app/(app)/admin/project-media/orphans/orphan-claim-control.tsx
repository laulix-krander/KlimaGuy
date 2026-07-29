"use client";

import React, { useActionState, useState } from "react";
import { claimProjectMediaOrphanAction } from "@/lib/actions/project-media-orphan-claim";

const messages = {
  cleanup_soft_deleted: "Der verwaiste Upload wurde fachlich bereinigt. Die physische Datei bleibt bis zum späteren Purge gespeichert.",
  cleanup_not_eligible: "Der Upload ist nicht mehr für die Bereinigung geeignet.",
  cleanup_conflict: "Der Upload ist nicht mehr für die Bereinigung geeignet.",
  cleanup_forbidden: "Der verwaiste Upload konnte nicht fachlich bereinigt werden.",
  cleanup_failed: "Der verwaiste Upload konnte nicht fachlich bereinigt werden.",
} as const;

export function OrphanClaimControl({ mediaId, projectId }: { mediaId: string; projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(claimProjectMediaOrphanAction, null);

  if (!confirming && !state) {
    return <button className="rounded border px-3 py-2 font-medium hover:bg-slate-50" onClick={() => setConfirming(true)} type="button">Fachlich bereinigen</button>;
  }

  return (
    <div className="min-w-64 space-y-2" aria-busy={pending}>
      {state ? <p className={state.success ? "text-emerald-700" : "text-red-700"} role="status">{messages[state.code]}</p> : (
        <>
          <p id={`claim-warning-${mediaId}`}>
            Dieser verwaiste Upload wird fachlich ausgeblendet. Die physische Datei bleibt bis zu einem späteren kontrollierten Purge im privaten Speicher erhalten.
          </p>
          <form action={action} aria-describedby={`claim-warning-${mediaId}`} className="flex gap-2">
            <input name="media_id" type="hidden" value={mediaId} />
            <input name="project_id" type="hidden" value={projectId} />
            <button aria-disabled={pending} className="rounded border px-3 py-2" disabled={pending} onClick={() => setConfirming(false)} type="button">Abbrechen</button>
            <button aria-disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-white" disabled={pending} type="submit">
              {pending ? "Wird bereinigt …" : "Fachlich bereinigen"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
