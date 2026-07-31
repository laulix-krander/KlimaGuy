import { canChangeUserRole } from "@/lib/domain/permissions";
import { changeUserRoleSchema, roleSchema } from "@/lib/domain/schemas";
import type { Role } from "@/lib/domain/types";

export type ChangeUserRoleInput = {
  target_user_id: string;
  target_role: Role;
  expected_current_role: Role;
};

type RpcRoleChangeRow = {
  result_target_user_id: unknown;
  old_role: unknown;
  new_role: unknown;
  changed: unknown;
  result_code: unknown;
};

export type UserRoleChangeDataSource = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{ role: unknown } | null>;
  changeRoleAtomically(input: ChangeUserRoleInput): Promise<RpcRoleChangeRow | null>;
};

type FailureCode = "user_role_forbidden" | "user_not_found" | "user_role_invalid" |
  "user_role_conflict" | "last_admin_protected" | "self_role_change_blocked" | "user_role_change_failed";

const failureMessages: Record<FailureCode, string> = {
  user_role_forbidden: "Der Zugriff ist nicht erlaubt.",
  user_not_found: "Für diesen Benutzer ist kein gültiges Profil vorhanden.",
  user_role_invalid: "Die angeforderte Benutzerrolle ist ungültig.",
  user_role_conflict: "Die Rolle wurde zwischenzeitlich geändert. Bitte lade die Benutzerliste neu.",
  last_admin_protected: "Der letzte Administrator kann nicht zum Reviewer herabgestuft werden.",
  self_role_change_blocked: "Du kannst deine eigene Rolle nicht ändern.",
  user_role_change_failed: "Die Benutzerrolle konnte nicht aktualisiert werden.",
};

export type UserRoleChangeResult =
  | { success: true; target_user_id: string; old_role: Role; new_role: Role; changed: boolean; code: "role_changed" | "no_change" }
  | { success: false; code: FailureCode; error: string };

function failure(code: FailureCode): UserRoleChangeResult {
  return { success: false, code, error: failureMessages[code] };
}

export async function changeUserRole(
  rawInput: unknown,
  source: UserRoleChangeDataSource,
): Promise<UserRoleChangeResult> {
  const input = changeUserRoleSchema.safeParse(rawInput);
  if (!input.success) return failure("user_role_invalid");

  try {
    const user = await source.getUser();
    if (!user) return failure("user_role_forbidden");
    const profile = await source.getProfile(user.id);
    const actorRole = roleSchema.safeParse(profile?.role);
    if (!actorRole.success) return failure(profile ? "user_role_invalid" : "user_not_found");
    if (!canChangeUserRole(actorRole.data)) return failure("user_role_forbidden");
    if (user.id === input.data.target_user_id) return failure("self_role_change_blocked");

    const row = await source.changeRoleAtomically(input.data);
    if (!row || row.result_target_user_id !== input.data.target_user_id) return failure("user_role_change_failed");

    if (row.result_code === "forbidden") return failure("user_role_forbidden");
    if (row.result_code === "target_not_found") return failure("user_not_found");
    if (row.result_code === "role_conflict") return failure("user_role_conflict");
    if (row.result_code === "last_admin_protected") return failure("last_admin_protected");
    if (row.result_code === "self_change_blocked") return failure("self_role_change_blocked");
    if (row.result_code !== "role_changed" && row.result_code !== "no_change") return failure("user_role_change_failed");

    const oldRole = roleSchema.safeParse(row.old_role);
    const newRole = roleSchema.safeParse(row.new_role);
    const expectedChanged = row.result_code === "role_changed";
    if (!oldRole.success || !newRole.success || row.changed !== expectedChanged) return failure("user_role_change_failed");
    return { success: true, target_user_id: input.data.target_user_id, old_role: oldRole.data, new_role: newRole.data, changed: expectedChanged, code: row.result_code };
  } catch {
    return failure("user_role_change_failed");
  }
}
