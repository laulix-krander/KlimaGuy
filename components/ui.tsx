import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-white p-6 shadow-sm", className)} {...props} />;
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "ok" | "danger" }) {
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", tone === "warn" ? "bg-amber-100 text-amber-900" : tone === "ok" ? "bg-emerald-100 text-emerald-900" : tone === "danger" ? "bg-red-100 text-red-900" : "bg-slate-100 text-slate-800")}>{children}</span>;
}

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50", className)} {...props} />;
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return <Link className={cn("inline-flex rounded-lg px-4 py-2 font-medium", variant === "primary" ? "bg-teal-700 text-white hover:bg-teal-800 hover:text-white" : "border bg-white text-slate-800 hover:bg-slate-50")} href={href}>{children}</Link>;
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{message}</div>;
}

export function SuccessBox({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{message}</div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-slate-600">{children}</div>;
}

export function Nav() {
  return <nav className="border-b bg-white"><div className="mx-auto flex max-w-6xl gap-5 px-4 py-4"><Link className="font-bold text-teal-800" href="/dashboard">KlimaGuy</Link><Link href="/customers">Kunden</Link><Link href="/projects">Projekte</Link><form action="/auth/logout" method="post" className="ml-auto"><button className="text-slate-600">Logout</button></form></div></nav>;
}
