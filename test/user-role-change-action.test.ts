import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const action = readFileSync("lib/actions/user-role-change.ts", "utf8");
const service = readFileSync("lib/actions/user-role-change-service.ts", "utf8");

describe("role change action architecture", () => {
  it("delegates to the service and revalidates only a changed success", () => {
    expect(action).toContain("changeUserRole(input, source)");
    expect(action).toContain('if (result.success && result.changed) revalidatePath("/admin/users")');
    expect(action).not.toContain("redirect(");
  });

  it("uses only the RPC mutation boundary", () => {
    expect(action).toContain('rpc("change_user_profile_role", args)');
    expect(`${action}\n${service}`).not.toMatch(/from\(["']profiles["']\)\.update|auth\.admin|SUPABASE_SERVICE_ROLE|service_role/i);
    expect(`${action}\n${service}`).not.toMatch(/email/i);
  });
});
