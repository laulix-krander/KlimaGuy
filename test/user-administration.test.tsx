import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/user-administration-auth-read-adapter", () => ({
  listAuthUsersForAdministration: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { UserAdministrationView } from "@/app/(app)/admin/users/user-administration-view";
import { readUserAdministration } from "@/lib/actions/user-administration-read-service";
import { canViewUserAdministration } from "@/lib/domain/permissions";
import { userAdministrationQuerySchema } from "@/lib/domain/schemas";

const adminId = "11111111-1111-4111-8111-111111111111";
const reviewerId = "22222222-2222-4222-8222-222222222222";
const missingId = "33333333-3333-4333-8333-333333333333";
const authPage = { users: [
  { id: reviewerId, email: "reviewer@example.invalid", created_at: "2026-07-30T10:00:00.000Z" },
  { id: adminId, email: "admin@example.invalid", created_at: "2026-07-31T10:00:00.000Z" },
  { id: missingId, email: null, created_at: "2026-07-31T10:00:00.000Z" },
], page: 1, per_page: 25, has_next_page: true };

function source(role: unknown = "admin") {
  return {
    getUser: vi.fn(async () => ({ id: adminId })),
    getProfile: vi.fn(async () => role === null ? null : ({ role })),
    listAuthUsers: vi.fn(async () => authPage),
    listProfilesByIds: vi.fn(async () => [{ id: adminId, role: "admin" }, { id: reviewerId, role: "broken" }]),
  };
}

describe("Read-only Benutzerverwaltung", () => {
  it("erlaubt nur Admins und validiert die Query strikt", () => {
    expect(canViewUserAdministration("admin")).toBe(true);
    expect(canViewUserAdministration("reviewer")).toBe(false);
    expect(canViewUserAdministration(null)).toBe(false);
    expect(userAdministrationQuerySchema.parse({})).toEqual({ page: 1, per_page: 25 });
    expect(userAdministrationQuerySchema.parse({ page: "2", per_page: "50" })).toEqual({ page: 2, per_page: 50 });
    for (const invalid of [{ page: "0" }, { page: "x" }, { per_page: "51" }, { search: "x" }]) expect(userAdministrationQuerySchema.safeParse(invalid).success).toBe(false);
  });

  it("lehnt fehlende Session, fehlendes/ungültiges Profil und Reviewer vor Datenabruf ab", async () => {
    for (const ownRole of [null, "reviewer", "broken"]) {
      const data = source(ownRole);
      if (ownRole === null) data.getProfile = vi.fn(async () => null);
      const result = await readUserAdministration({}, data);
      expect(result).toEqual({ success: false, error: "Die Benutzerverwaltung konnte nicht geladen werden." });
      expect(data.listAuthUsers).not.toHaveBeenCalled();
    }
    const data = { ...source(), getUser: vi.fn(async () => null) };
    expect((await readUserAdministration({}, data)).success).toBe(false);
  });

  it("joint schmal, markiert Inkonsistenzen/current user und sortiert deterministisch", async () => {
    const data = source();
    const result = await readUserAdministration({}, data);
    expect(data.listAuthUsers).toHaveBeenCalledWith({ page: 1, perPage: 25 });
    expect(data.listProfilesByIds).toHaveBeenCalledWith([reviewerId, adminId, missingId]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.users.map(({ user_id }) => user_id)).toEqual([missingId, adminId, reviewerId]);
    expect(result.data.users[1]).toEqual({ user_id: adminId, email: "admin@example.invalid", role: "admin", profile_status: "active", auth_status: "unknown", created_at: "2026-07-31T10:00:00.000Z", is_current_user: true });
    expect(result.data.users[0].profile_status).toBe("missing");
    expect(result.data.users[0].role).toBeNull();
    expect(result.data.users[2].profile_status).toBe("invalid_role");
    expect(result.data.users[2].role).toBeNull();
    expect(Object.keys(result.data.users[1])).toEqual(["user_id", "email", "role", "profile_status", "auth_status", "created_at", "is_current_user"]);
  });

  it("mappt Auth- und Profilfehler neutral", async () => {
    const authFailure = source(); authFailure.listAuthUsers.mockRejectedValueOnce(new Error("provider detail"));
    expect((await readUserAdministration({}, authFailure)).success).toBe(false);
    const profileFailure = source(); profileFailure.listProfilesByIds.mockRejectedValueOnce(new Error("database detail"));
    expect((await readUserAdministration({}, profileFailure)).success).toBe(false);
  });

  it("zeigt Liste, deutsche Labels, Datum, Du, Hinweise und Pagination ohne eigene Rollenaktion", () => {
    render(<UserAdministrationView result={{ success: true, data: { users: [{ user_id: adminId, email: "admin@example.invalid", role: "admin", profile_status: "active", auth_status: "unknown", created_at: "2026-07-31T10:00:00.000Z", is_current_user: true }], page: 2, per_page: 25, has_next_page: true } }} />);
    expect(screen.getByRole("heading", { name: "Benutzer & Rollen" })).toBeTruthy();
    for (const text of ["admin@example.invalid", "Administrator", "Aktiv", "Nicht eindeutig bestimmbar", "Hier siehst du die vorhandenen Benutzer und ihre aktuellen Anwendungsrollen.", "Rollenänderungen sind für gültige Profile anderer Benutzer kontrolliert möglich.", "Seite 2"]) expect(screen.getByText(text, { exact: false })).toBeTruthy();
    expect(screen.getByText("Du", { exact: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zurück" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Weiter" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Die eigene Rolle kann nicht geändert werden.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("zeigt Empty State und neutralen Fehlerzustand", () => {
    const { rerender } = render(<UserAdministrationView result={{ success: true, data: { users: [], page: 1, per_page: 25, has_next_page: false } }} />);
    expect(screen.getByText("Keine Benutzer gefunden.")).toBeTruthy();
    rerender(<UserAdministrationView result={{ success: false, error: "Die Benutzerverwaltung konnte nicht geladen werden." }} />);
    expect(screen.getByRole("alert").textContent).toBe("Die Benutzerverwaltung konnte nicht geladen werden.");
  });
});

describe("Auth-Read-Adapter-Architektur", () => {
  const adapter = readFileSync("lib/server/user-administration-auth-read-adapter.ts", "utf8");
  it("ist server-only, eng, paginiert und ohne Mutation oder Anon-Fallback", () => {
    expect(adapter).toContain('import "server-only"');
    expect(adapter).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(adapter).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(adapter).toContain("supabase.auth.admin.listUsers({ page: params.page, perPage: params.perPage })");
    expect(adapter).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    for (const forbidden of ["inviteUserByEmail", "createUser", "updateUserById", "deleteUser", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "identities", "access_token", "refresh_token"]) expect(adapter).not.toContain(forbidden);
    expect(adapter.match(/^export (async function|type)/gm)?.length).toBe(4);
    expect(adapter).toContain("findAuthUserIdByExactEmail");
  });
});
