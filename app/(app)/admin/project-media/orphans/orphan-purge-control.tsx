"use client";

import React, { useActionState, useState } from "react";
import { purgeProjectMediaOrphanAction } from "@/lib/actions/project-media-storage-purge";

const messages = {
  purge_completed: "Die physische Datei wurde endgültig entfernt.", purge_already_completed: "Die physische Datei wurde bereits entfernt.",
  purge_not_eligible: "Das Medium ist nicht mehr für den Purge geeignet.", purge_conflict: "Das Medium ist nicht mehr für den Purge geeignet.",
  purge_forbidden: "Die physische Datei konnte nicht endgültig entfernt werden.", purge_retry_required: "Die physische Datei konnte noch nicht vollständig entfernt werden. Der Vorgang kann sicher erneut versucht werden.",
  purge_configuration_missing: "Der sichere Speicherzugriff ist derzeit nicht konfiguriert.", purge_failed: "Die physische Datei konnte nicht endgültig entfernt werden.",
} as const;

export function OrphanPurgeControl({ mediaId, projectId }: { mediaId: string; projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(purgeProjectMediaOrphanAction, null);
  if (!confirming && !state) return <button className="rounded border px-3 py-2 font-medium" onClick={() => setConfirming(true)} type="button">Physische Datei entfernen</button>;
  return <div aria-busy={pending} className="min-w-72 space-y-2">{state ? <p className={state.success ? "text-emerald-700" : "text-red-700"} role="status">{messages[state.code]}</p> : <>
    <p id={`purge-warning-${mediaId}`}>Die physische Datei wird dauerhaft aus dem privaten Speicher entfernt. Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
    <form action={action} aria-describedby={`purge-warning-${mediaId}`} className="flex gap-2"><input name="media_id" type="hidden" value={mediaId}/><input name="project_id" type="hidden" value={projectId}/>
      <button aria-disabled={pending} className="rounded border px-3 py-2" disabled={pending} onClick={() => setConfirming(false)} type="button">Abbrechen</button>
      <button aria-disabled={pending} className="rounded bg-red-700 px-3 py-2 text-white" disabled={pending} type="submit">{pending ? "Wird endgültig entfernt …" : "Physische Datei endgültig entfernen"}</button>
    </form></>}</div>;
}
