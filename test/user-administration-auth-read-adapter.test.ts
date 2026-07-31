import { beforeEach, describe, expect, it, vi } from "vitest";

const listUsers = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { admin: { listUsers } } })),
}));

import { createClient } from "@supabase/supabase-js";
import { listAuthUsersForAdministration } from "@/lib/server/user-administration-auth-read-adapter";

describe("User-Administration Auth-Read-Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "artificial-service-role-key";
  });

  it("verwendet Default 25 und gibt nur freigegebene Felder aus", async () => {
    listUsers.mockResolvedValueOnce({ data: { users: [{ id: "11111111-1111-4111-8111-111111111111", email: "user@example.invalid", created_at: "2026-07-31T10:00:00.000Z", last_sign_in_at: "secret", raw_user_meta_data: { secret: true }, identities: [{ secret: true }] }], total: 26 }, error: null });
    const result = await listAuthUsersForAdministration();
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 25 });
    expect(result).toEqual({ users: [{ id: "11111111-1111-4111-8111-111111111111", email: "user@example.invalid", created_at: "2026-07-31T10:00:00.000Z" }], page: 1, per_page: 25, total: 26, has_next_page: true });
    expect(JSON.stringify(result)).not.toMatch(/last_sign|metadata|identities|secret/);
  });

  it("übergibt validierte Pagination bis höchstens 50", async () => {
    listUsers.mockResolvedValueOnce({ data: { users: [], total: 0 }, error: null });
    await listAuthUsersForAdministration({ page: 3, perPage: 50 });
    expect(listUsers).toHaveBeenCalledWith({ page: 3, perPage: 50 });
    await expect(listAuthUsersForAdministration({ perPage: 51 })).rejects.toThrow();
  });

  it("besitzt keinen Konfigurationsfallback und mappt Providerfehler neutral", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(listAuthUsersForAdministration()).rejects.toThrow("user_administration_failed");
    expect(createClient).not.toHaveBeenCalled();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "artificial-service-role-key";
    listUsers.mockResolvedValueOnce({ data: { users: [] }, error: new Error("provider detail") });
    await expect(listAuthUsersForAdministration()).rejects.toThrow("user_administration_failed");
  });
});
