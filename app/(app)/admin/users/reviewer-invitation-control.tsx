"use client";

import React, { useEffect, useRef, useState } from "react";
import { inviteReviewerAction } from "@/lib/actions/reviewer-invitation";
import type { ReviewerInvitationCode } from "@/lib/actions/reviewer-invitation-service";

const ERROR_MESSAGES: Record<Exclude<ReviewerInvitationCode, "reviewer_invited">, string> = {
  reviewer_already_exists: "Für diese E-Mail-Adresse besteht bereits ein Benutzerkonto.",
  reviewer_invitation_pending: "Für diese E-Mail-Adresse besteht bereits eine offene Einladung.",
  reviewer_invitation_forbidden: "Der Zugriff ist nicht erlaubt.",
  reviewer_invitation_invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
  reviewer_invitation_conflict: "Die Einladung konnte wegen eines zwischenzeitlichen Konflikts nicht erstellt werden.",
  reviewer_invitation_configuration_error: "Die Einladungsfunktion ist derzeit nicht korrekt konfiguriert.",
  reviewer_profile_inconsistent: "Die Einladung wurde erstellt, das Reviewer-Profil konnte jedoch nicht bestätigt werden.",
  reviewer_invitation_failed: "Die Reviewer-Einladung konnte nicht versendet werden.",
};

export function ReviewerInvitationControl() {
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (confirming) cancelRef.current?.focus(); }, [confirming]);
  useEffect(() => {
    if (message?.kind === "alert") messageRef.current?.focus();
    if (message?.kind === "status") inputRef.current?.focus();
  }, [message]);

  function openConfirmation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || confirming) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setMessage(null);
    setConfirming(true);
  }

  function cancel() {
    if (submittingRef.current) return;
    setConfirming(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function sendInvitation() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await inviteReviewerAction({ email });
      setConfirming(false);
      if (result.success && result.code === "reviewer_invited") {
        setEmail("");
        setMessage({ kind: "status", text: "Die Reviewer-Einladung wurde versendet." });
      } else if (!result.success) {
        setMessage({ kind: "alert", text: ERROR_MESSAGES[result.code] });
      } else setMessage({ kind: "alert", text: ERROR_MESSAGES.reviewer_invitation_failed });
    } catch {
      setConfirming(false);
      setMessage({ kind: "alert", text: ERROR_MESSAGES.reviewer_invitation_failed });
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return <section aria-busy={pending} aria-labelledby="reviewer-invitation-title" className="rounded-xl border bg-white p-4 shadow-sm sm:p-6">
    <h2 className="text-xl font-semibold" id="reviewer-invitation-title">Reviewer einladen</h2>
    <p className="mt-2 text-sm text-slate-700">Lade einen weiteren Benutzer per E-Mail als Reviewer ein. Reviewer können Projekte und Projektmedien ansehen, aber keine administrativen Änderungen durchführen.</p>
    <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">Hinweis: Über diese Funktion können ausschließlich Reviewer eingeladen werden.</p>
    {message ? <p className={`mt-4 rounded border p-3 text-sm ${message.kind === "alert" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} ref={messageRef} role={message.kind} tabIndex={message.kind === "alert" ? -1 : undefined}>{message.text}</p> : null}
    <form className="mt-4 space-y-3" onSubmit={openConfirmation}><div><label className="mb-1 block text-sm font-medium" htmlFor="reviewer-email">E-Mail-Adresse</label><input aria-disabled={pending} autoComplete="email" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100" disabled={pending} id="reviewer-email" inputMode="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} placeholder="name@beispiel.de" ref={inputRef} required type="email" value={email} /></div>{!confirming ? <button className="min-h-11 rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" ref={openerRef} type="submit">Reviewer einladen</button> : null}</form>
    {confirming ? <div aria-labelledby="reviewer-confirmation-title" className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4" role="group"><h3 className="font-semibold" id="reviewer-confirmation-title">Reviewer wirklich einladen?</h3><p className="text-sm">An folgende E-Mail-Adresse wird eine Einladung als Reviewer gesendet:</p><p className="break-all font-medium">{email}</p><p className="text-sm">Der eingeladene Benutzer erhält keine Administratorrechte.</p>{pending ? <p className="text-sm" role="status">Einladung wird gesendet …</p> : null}<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button aria-disabled={pending} className="min-h-11 rounded-lg border bg-white px-4 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} onClick={cancel} ref={cancelRef} type="button">Abbrechen</button><button aria-disabled={pending} className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} onClick={() => void sendInvitation()} type="button">Einladung senden</button></div></div> : null}
  </section>;
}
