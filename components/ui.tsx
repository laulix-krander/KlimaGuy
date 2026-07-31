import Link from "next/link";
import React from "react";
import { canViewProjectMediaOrphanInventory, canViewUserAdministration } from "@/lib/domain/permissions";
import type { Role } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-xl border bg-white p-6 shadow-sm", className)} {...props} />; }
export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "ok" }) { return <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", tone === "warn" ? "bg-amber-100 text-amber-900" : tone === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-800")}>{children}</span>; }
export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={cn("rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50", className)} {...props} />; }
export function Nav({ role }: { role: Role | null }) {
  const canViewMediaInventory = role !== null && canViewProjectMediaOrphanInventory(role);
  const canViewUsers = canViewUserAdministration(role);
  const canViewAdministration = canViewMediaInventory || canViewUsers;

  return <nav className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-4"><Link className="font-bold text-teal-800" href="/dashboard">KlimaGuy</Link><Link href="/customers">Kunden</Link><Link href="/projects">Projekte</Link>{canViewAdministration ? <div aria-label="Administration" className="flex items-center gap-5 border-l pl-5"><span className="font-semibold">Administration</span>{canViewMediaInventory ? <Link href="/admin/project-media/orphans">Medien-Inventur</Link> : null}{canViewUsers ? <Link href="/admin/users">Benutzer &amp; Rollen</Link> : null}</div> : null}<form action="/auth/logout" method="post" className="ml-auto"><button className="text-slate-600">Logout</button></form></div></nav>;
}
