"use client";

import React, { useMemo, useRef, useState } from "react";
import type { ProjectEvidenceBindingResult } from "@/lib/actions/project-evidence-binding-service";
import type { BindProjectMediaEvidenceClientInput, ProjectEvidenceDto } from "@/lib/domain/conversation-intelligence/project-evidence";
import { ACTIVE_IMAGE_EVIDENCE_TARGETS, EVIDENCE_PURPOSE_LABELS, EVIDENCE_TARGET_LABELS } from "@/lib/domain/conversation-intelligence/project-evidence-display";
import type { EvidencePurposeCode, EvidenceTargetKey } from "@/lib/domain/conversation-intelligence/evidence-request";

type Props = { mediaId: string; initialBindings: ProjectEvidenceDto[]; bindEvidence: (input: BindProjectMediaEvidenceClientInput) => Promise<ProjectEvidenceBindingResult> };
const errors: Record<Extract<ProjectEvidenceBindingResult, { success: false }>["code"], string> = {
  unauthenticated: "Bitte melden Sie sich erneut an.", invalid_profile: "Das Benutzerprofil konnte nicht überprüft werden.", forbidden: "Sie sind nicht berechtigt, dieses Bild als Evidence zu binden.", invalid_input: "Evidence Target oder Purpose ist ungültig.", project_not_found: "Projekt oder Medium wurde nicht gefunden.", media_not_found: "Projekt oder Medium wurde nicht gefunden.", project_mismatch: "Die Evidence-Bindung steht im Konflikt mit dem Projekt und wurde nicht gespeichert.", media_not_eligible: "Dieses Bild ist nicht bindbar.", persistence_failed: "Die Evidence-Bindung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
};

export function ProjectMediaEvidenceBinding({ mediaId, initialBindings, bindEvidence }: Props) {
  const [bindings, setBindings] = useState(initialBindings), [open, setOpen] = useState(false), [confirming, setConfirming] = useState(false);
  const [target, setTarget] = useState<EvidenceTargetKey | "">(""), [purpose, setPurpose] = useState<EvidencePurposeCode | "">("");
  const [message, setMessage] = useState<{ kind: "status" | "error"; text: string } | null>(null), [pending, setPending] = useState(false);
  const pendingRef = useRef(false), openerRef = useRef<HTMLButtonElement>(null), statusRef = useRef<HTMLParagraphElement>(null);
  const options = useMemo(() => ACTIVE_IMAGE_EVIDENCE_TARGETS.map((option) => ({ ...option, purposes: option.purposes.filter((candidate) => !bindings.some((binding) => binding.target === option.target_key && binding.purpose === candidate.code)) })).filter((option) => option.purposes.length), [bindings]);
  const selected = options.find((option) => option.target_key === target);
  function chooseTarget(value: string) { const next = options.find((option) => option.target_key === value); setTarget(next?.target_key ?? ""); setPurpose(next?.purposes.length === 1 ? next.purposes[0].code : ""); setConfirming(false); setMessage(null); }
  function cancel() { setConfirming(false); setOpen(false); setTarget(""); setPurpose(""); setMessage(null); requestAnimationFrame(() => openerRef.current?.focus()); }
  async function submit() {
    if (pendingRef.current || !target || !purpose) return;
    pendingRef.current = true; setPending(true); setMessage({ kind: "status", text: "Evidence wird gebunden …" });
    const result = await bindEvidence({ project_media_id: mediaId, evidence_target: target, purpose });
    pendingRef.current = false; setPending(false);
    if (!result.success) { setMessage({ kind: "error", text: errors[result.code] }); return; }
    setBindings((current) => current.some((binding) => binding.evidence_id === result.data.evidence_id) ? current : [...current, result.data]);
    setMessage({ kind: "status", text: result.result === "already_bound" ? "Dieses Bild ist für diesen Zweck bereits als Evidence gebunden." : "Bild wurde als Evidence gebunden. Noch nicht technisch ausgewertet." });
    setConfirming(false); setTarget(""); setPurpose(""); requestAnimationFrame(() => statusRef.current?.focus());
  }
  return <section aria-busy={pending} className="space-y-3 border-t px-4 pb-4 pt-3">
    {bindings.length ? <div className="space-y-2"><h3 className="text-sm font-semibold">Evidence</h3><ul className="space-y-2">{bindings.map((binding) => <li className="rounded-lg bg-teal-50 p-2 text-xs text-slate-800" key={binding.evidence_id}><span className="font-medium">{EVIDENCE_TARGET_LABELS[binding.target]}</span><span className="block">{EVIDENCE_PURPOSE_LABELS[binding.purpose]}</span><span className="block text-teal-800">Vorhanden – noch nicht ausgewertet</span></li>)}</ul></div> : null}
    <p className="text-xs font-semibold text-slate-700">Die Evidence-Bindung ist keine technische Bewertung oder Freigabe.</p>
    {!open ? <button className="min-h-11 rounded-lg border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:opacity-50" disabled={!options.length} onClick={() => setOpen(true)} ref={openerRef} type="button">{options.length ? "Als Evidence verwenden" : "Alle Evidence-Zwecke gebunden"}</button> : !confirming ? <div className="space-y-3">
      <div><label className="mb-1 block text-sm font-medium" htmlFor={`evidence-target-${mediaId}`}>Evidence Target</label><select aria-disabled={pending} className="min-h-11 w-full rounded-lg border px-3 focus:outline-none focus:ring-2 focus:ring-teal-600" disabled={pending} id={`evidence-target-${mediaId}`} onChange={(event) => chooseTarget(event.target.value)} value={target}><option value="">Bitte wählen</option>{options.map((option) => <option key={option.target_key} value={option.target_key}>{option.label}</option>)}</select></div>
      {selected?.purposes.length === 1 ? <p className="text-sm"><span className="font-medium">Purpose:</span> {selected.purposes[0].label}</p> : selected ? <div><label className="mb-1 block text-sm font-medium" htmlFor={`evidence-purpose-${mediaId}`}>Purpose</label><select aria-disabled={pending} className="min-h-11 w-full rounded-lg border px-3 focus:outline-none focus:ring-2 focus:ring-teal-600" disabled={pending} id={`evidence-purpose-${mediaId}`} onChange={(event) => setPurpose(event.target.value as EvidencePurposeCode)} value={purpose}><option value="">Bitte wählen</option>{selected.purposes.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></div> : null}
      <div className="flex flex-col gap-2 sm:flex-row"><button className="min-h-11 rounded-lg border px-3 py-2 text-sm" onClick={cancel} type="button">Abbrechen</button><button aria-disabled={!target || !purpose || pending} className="min-h-11 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!target || !purpose || pending} onClick={() => setConfirming(true)} type="button">Auswahl prüfen</button></div>
    </div> : <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-3"><h3 className="font-semibold">Bild als Evidence verwenden?</h3><dl className="text-sm"><div><dt className="inline font-medium">Evidence Target: </dt><dd className="inline">{EVIDENCE_TARGET_LABELS[target as EvidenceTargetKey]}</dd></div><div><dt className="inline font-medium">Purpose: </dt><dd className="inline">{EVIDENCE_PURPOSE_LABELS[purpose as EvidencePurposeCode]}</dd></div></dl><p className="text-sm">Das Bild wird dadurch noch nicht technisch ausgewertet.</p><div className="flex flex-col gap-2 sm:flex-row"><button aria-disabled={pending} className="min-h-11 rounded-lg border bg-white px-3 py-2 text-sm" disabled={pending} onClick={cancel} type="button">Abbrechen</button><button aria-disabled={pending} className="min-h-11 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={submit} type="button">Als Evidence binden</button></div></div>}
    {message ? <p className={message.kind === "error" ? "text-sm text-red-700" : "text-sm text-teal-800"} ref={statusRef} role={message.kind === "error" ? "alert" : "status"} tabIndex={-1}>{message.text}</p> : null}
  </section>;
}
