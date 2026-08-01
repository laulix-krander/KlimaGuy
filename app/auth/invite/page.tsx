import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Card } from "@/components/ui";
import { REVIEWER_INVITE_CONTEXT_COOKIE } from "@/lib/auth/reviewer-invite-context";
import { getReviewerInviteAccess } from "@/lib/auth/reviewer-invite-access";
import { createClient } from "@/lib/supabase/server";
import { InvitePasswordForm } from "./invite-password-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PAGE_ERRORS = {
  invalid_or_expired: "Der Einladungslink ist ungültig oder abgelaufen.",
} as const;

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const queryMessage = error && Object.hasOwn(PAGE_ERRORS, error) ? PAGE_ERRORS[error as keyof typeof PAGE_ERRORS] : null;
  const cookieStore = await cookies();
  const supabase = await createClient();
  const access = await getReviewerInviteAccess({
    async getUser() {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      return data.user ? { id: data.user.id } : null;
    },
    async getProfile(id) {
      const { data, error: profileError } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
      if (profileError) throw profileError;
      return data;
    },
  }, cookieStore.get(REVIEWER_INVITE_CONTEXT_COOKIE)?.value ?? null);

  let accessMessage = "Die Einladung ist nicht mehr gültig. Bitte fordere eine neue Einladung an.";
  if (!access.allowed && access.code === "profile_missing") accessMessage = "Das Benutzerprofil konnte nicht bestätigt werden.";
  if (!access.allowed && access.code === "profile_invalid") accessMessage = "Das Benutzerprofil ist nicht für diesen Zugriff freigegeben.";

  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
    <Card className="w-full min-w-0">
      <h1 className="mb-2 text-2xl font-bold">Einladung annehmen</h1>
      <p className="mb-6 text-slate-600">Lege dein Passwort für den Reviewer-Zugang fest.</p>
      {queryMessage || !access.allowed ? <div className="space-y-4">
        <p className="break-words rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{queryMessage ?? accessMessage}</p>
        <Link className="inline-flex min-h-11 items-center font-medium text-teal-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/login">Zurück zum Login</Link>
      </div> : <InvitePasswordForm />}
    </Card>
  </main>;
}
