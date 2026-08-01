"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { acceptReviewerInviteAction } from "@/lib/actions/accept-reviewer-invite";
import { INVITE_PASSWORD_MAX_LENGTH, INVITE_PASSWORD_MIN_LENGTH } from "@/lib/domain/schemas";

const ERROR_MESSAGES = {
  invite_session_missing: "Die Einladung ist nicht mehr gültig. Bitte fordere eine neue Einladung an.",
  invite_session_invalid: "Die Einladung ist nicht mehr gültig. Bitte fordere eine neue Einladung an.",
  invite_profile_missing: "Das Benutzerprofil konnte nicht bestätigt werden.",
  invite_profile_invalid: "Das Benutzerprofil ist nicht für diesen Zugriff freigegeben.",
  invite_password_invalid: "Das Passwort erfüllt die Anforderungen nicht.",
  invite_password_mismatch: "Die Passwörter stimmen nicht überein.",
  invite_link_invalid_or_expired: "Der Einladungslink ist ungültig oder abgelaufen.",
  invite_password_update_failed: "Das Passwort konnte nicht gespeichert werden.",
  invite_already_completed: "Das Passwort wurde bereits gespeichert.",
} as const;

export function InvitePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error || success) messageRef.current?.focus();
  }, [error, success]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || success) return;
    setError(null);
    if (password.length < INVITE_PASSWORD_MIN_LENGTH || password.length > INVITE_PASSWORD_MAX_LENGTH) {
      setError(ERROR_MESSAGES.invite_password_invalid);
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    if (password !== confirmation) {
      setError(ERROR_MESSAGES.invite_password_mismatch);
      requestAnimationFrame(() => messageRef.current?.focus());
      return;
    }
    submittingRef.current = true;
    setPending(true);
    try {
      const result = await acceptReviewerInviteAction({ password, password_confirmation: confirmation });
      if (result.success) {
        setPassword("");
        setConfirmation("");
        setSuccess(true);
        window.setTimeout(() => router.replace("/projects"), 900);
      } else {
        setError(ERROR_MESSAGES[result.code]);
      }
    } catch {
      setError(ERROR_MESSAGES.invite_password_update_failed);
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  if (success) return <div className="space-y-4">
    <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" ref={messageRef} role="status" tabIndex={-1}>Dein Passwort wurde gespeichert. Du kannst KlimaGuy jetzt verwenden.</p>
    <p className="text-sm text-slate-700">Du wirst zu den Projekten weitergeleitet.</p>
    <Link className="inline-flex min-h-11 items-center font-medium text-teal-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/projects">Jetzt zu den Projekten</Link>
  </div>;

  return <form aria-busy={pending} className="space-y-4" onSubmit={submit}>
    <p className="text-sm text-slate-700" id="invite-password-rules">Das Passwort muss mindestens {INVITE_PASSWORD_MIN_LENGTH} und darf höchstens {INVITE_PASSWORD_MAX_LENGTH} Zeichen lang sein. Beide Eingaben müssen übereinstimmen.</p>
    {error ? <p className="break-words rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" ref={messageRef} role="alert" tabIndex={-1}>{error}</p> : null}
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="invite-password">Neues Passwort</label>
      <input aria-describedby="invite-password-rules" autoComplete="new-password" className="min-h-11 w-full rounded border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" disabled={pending} id="invite-password" maxLength={INVITE_PASSWORD_MAX_LENGTH} minLength={INVITE_PASSWORD_MIN_LENGTH} onChange={(event) => setPassword(event.target.value)} ref={passwordRef} required type="password" value={password} />
    </div>
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="invite-password-confirmation">Passwort wiederholen</label>
      <input aria-describedby="invite-password-rules" autoComplete="new-password" className="min-h-11 w-full rounded border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" disabled={pending} id="invite-password-confirmation" maxLength={INVITE_PASSWORD_MAX_LENGTH} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
    </div>
    {pending ? <p aria-live="polite" role="status">Passwort wird gespeichert …</p> : null}
    <Button aria-disabled={pending} className="min-h-11 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" disabled={pending} type="submit">{pending ? "Passwort wird gespeichert …" : "Passwort speichern"}</Button>
  </form>;
}
