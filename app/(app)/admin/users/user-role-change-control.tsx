"use client";

import React, { useEffect, useRef, useState } from "react";
import { changeUserRoleAction } from "@/lib/actions/user-role-change";
import { ROLE_LABELS } from "@/lib/domain/role-labels";
import type { Role } from "@/lib/domain/types";
import type { AdminUserDto } from "@/lib/actions/user-administration-read-service";

const ERROR_MESSAGES = {
  user_role_forbidden: "Der Zugriff ist nicht erlaubt.",
  user_not_found: "Für diesen Benutzer ist kein gültiges Profil vorhanden.",
  user_role_invalid: "Die angeforderte Benutzerrolle ist ungültig.",
  user_role_conflict: "Die Rolle wurde zwischenzeitlich geändert. Bitte lade die Benutzerliste neu.",
  last_admin_protected: "Der letzte Administrator kann nicht zum Reviewer herabgestuft werden.",
  self_role_change_blocked: "Du kannst deine eigene Rolle nicht ändern.",
  user_role_change_failed: "Die Benutzerrolle konnte nicht aktualisiert werden.",
} as const;

type Props = Pick<AdminUserDto, "user_id" | "role" | "profile_status" | "is_current_user">;

export function UserRoleChangeControl({ user_id: targetUserId, role: currentRole, profile_status: profileStatus, is_current_user: isCurrentUser }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const submittingRef = useRef(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (message?.kind === "alert") messageRef.current?.focus();
  }, [message]);

  if (isCurrentUser) return <p className="text-sm text-slate-600">Die eigene Rolle kann nicht geändert werden.</p>;
  if (profileStatus === "missing") return <p className="text-sm text-slate-600">Rollenänderung nicht möglich: Profil fehlt.</p>;
  if (profileStatus === "invalid_role" || currentRole === null) return <p className="text-sm text-slate-600">Rollenänderung nicht möglich: Ungültige Rolle.</p>;
  if (currentRole === "system") return <p className="text-sm text-slate-600">Technische Systemidentität – Rollenänderung gesperrt.</p>;

  const validatedCurrentRole: Role = currentRole;
  const targetRole: Role = validatedCurrentRole === "reviewer" ? "admin" : "reviewer";
  const isPromotion = targetRole === "admin";

  function cancel() {
    if (submittingRef.current) return;
    setConfirming(false);
    setMessage(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await changeUserRoleAction({
        target_user_id: targetUserId,
        target_role: targetRole,
        expected_current_role: validatedCurrentRole,
      });
      setConfirming(false);
      if (result.success) {
        setMessage({ kind: "status", text: result.changed ? "Die Benutzerrolle wurde aktualisiert." : "Die Benutzerrolle ist bereits aktuell." });
      } else {
        setMessage({ kind: "alert", text: ERROR_MESSAGES[result.code] });
      }
    } catch {
      setConfirming(false);
      setMessage({ kind: "alert", text: ERROR_MESSAGES.user_role_change_failed });
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2" aria-busy={pending}>
      {message ? <p className={message.kind === "alert" ? "text-sm text-red-700" : "text-sm text-emerald-700"} ref={messageRef} role={message.kind} tabIndex={message.kind === "alert" ? -1 : undefined}>{message.text}</p> : null}
      {!confirming ? (
        <button className="min-h-11 rounded border px-3 py-2 font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={() => { setMessage(null); setConfirming(true); }} ref={openerRef} type="button">Rolle ändern</button>
      ) : (
        <form className="max-w-md space-y-3 rounded border border-slate-200 bg-slate-50 p-3" onSubmit={submit}>
          <h3 className="font-semibold">{isPromotion ? "Benutzer zum Administrator machen?" : "Administrator zum Reviewer herabstufen?"}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm"><dt>Aktuelle Rolle:</dt><dd className="font-medium">{ROLE_LABELS[validatedCurrentRole]}</dd><dt>Neue Rolle:</dt><dd className="font-medium">{ROLE_LABELS[targetRole]}</dd></dl>
          <p className="text-sm">{isPromotion ? "Dieser Benutzer erhält anschließend Zugriff auf administrative Funktionen." : "Warnung: Dieser Benutzer verliert anschließend den Zugriff auf administrative Funktionen. Der letzte Administrator kann nicht herabgestuft werden."}</p>
          {pending ? <p className="text-sm" role="status">Wird aktualisiert …</p> : null}
          <div className="flex flex-wrap gap-2">
            <button aria-disabled={pending} className="min-h-11 rounded border bg-white px-3 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} onClick={cancel} ref={cancelRef} type="button">Abbrechen</button>
            <button aria-disabled={pending} className="min-h-11 rounded bg-slate-900 px-3 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">{isPromotion ? "Zum Administrator machen" : "Zum Reviewer machen"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
