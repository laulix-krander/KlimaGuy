import Link from "next/link";
import React from "react";
import { Badge, Card } from "@/components/ui";
import type { UserAdministrationResult } from "@/lib/actions/user-administration-read-service";
import { ROLE_LABELS } from "@/lib/domain/role-labels";
import { UserRoleChangeControl } from "./user-role-change-control";
import { ReviewerInvitationControl } from "./reviewer-invitation-control";

const profileLabels = { active: "Aktiv", missing: "Profil fehlt", invalid_role: "Ungültige Rolle" } as const;
function formatDate(value: string): string { return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)); }

export function UserAdministrationView({ result }: { result: UserAdministrationResult }) {
  if (!result.success) return <Card><h1 className="mb-3 text-3xl font-bold">Benutzer &amp; Rollen</h1><p className="text-red-700" role="alert">{result.error}</p></Card>;
  const { users, page, has_next_page: hasNextPage } = result.data;
  return <div className="space-y-6"><header><h1 className="text-3xl font-bold">Benutzer &amp; Rollen</h1><p className="mt-2">Hier siehst du die vorhandenen Benutzer und ihre aktuellen Anwendungsrollen.</p><p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">Rollenänderungen sind für gültige Profile anderer Benutzer kontrolliert möglich.</p></header><ReviewerInvitationControl /><Card>{users.length === 0 ? <p>Keine Benutzer gefunden.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">E-Mail</th><th className="p-2">Rolle</th><th className="p-2">Profilstatus</th><th className="p-2">Auth-Status</th><th className="p-2">Erstellt am</th><th className="p-2">Rollenaktion</th></tr></thead><tbody>{users.map((user) => <tr className="border-b align-top last:border-0" key={user.user_id}><td className="max-w-64 break-all p-2 font-medium">{user.email ?? "Nicht verfügbar"} {user.is_current_user ? <Badge tone="ok">Du</Badge> : null}</td><td className="p-2">{user.role ? ROLE_LABELS[user.role] : "Keine gültige Rolle"}</td><td className="p-2"><Badge tone={user.profile_status === "active" ? "ok" : "warn"}>{profileLabels[user.profile_status]}</Badge></td><td className="p-2">Nicht eindeutig bestimmbar</td><td className="p-2">{formatDate(user.created_at)}</td><td className="min-w-72 p-2"><UserRoleChangeControl is_current_user={user.is_current_user} profile_status={user.profile_status} role={user.role} user_id={user.user_id} /></td></tr>)}</tbody></table></div>}</Card><nav aria-label="Seitennavigation" className="flex items-center justify-between"><span>{page > 1 ? <Link className="rounded border px-3 py-2" href={`/admin/users?page=${page - 1}`}>Zurück</Link> : <span aria-disabled="true" className="rounded border px-3 py-2 text-slate-400">Zurück</span>}</span><span>Seite {page}</span><span>{hasNextPage ? <Link className="rounded border px-3 py-2" href={`/admin/users?page=${page + 1}`}>Weiter</Link> : <span aria-disabled="true" className="rounded border px-3 py-2 text-slate-400">Weiter</span>}</span></nav></div>;
}
