import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { changeUserRoleAction } = vi.hoisted(() => ({ changeUserRoleAction: vi.fn() }));
vi.mock("@/lib/actions/user-role-change", () => ({ changeUserRoleAction }));

import { UserRoleChangeControl } from "@/app/(app)/admin/users/user-role-change-control";

const reviewerId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";

afterEach(() => { cleanup(); changeUserRoleAction.mockReset(); });

function renderControl(overrides: Partial<React.ComponentProps<typeof UserRoleChangeControl>> = {}) {
  return render(<UserRoleChangeControl user_id={reviewerId} role="reviewer" profile_status="active" is_current_user={false} {...overrides} />);
}

describe("Controlled User Role Change UI", () => {
  it("zeigt Aktionen nur für gültige Fremdprofile und sonst konkrete Hinweise", () => {
    const { rerender } = renderControl();
    expect(screen.getByRole("button", { name: "Rolle ändern" })).toBeTruthy();
    rerender(<UserRoleChangeControl user_id={adminId} role="admin" profile_status="active" is_current_user />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Die eigene Rolle kann nicht geändert werden.")).toBeTruthy();
    rerender(<UserRoleChangeControl user_id={adminId} role={null} profile_status="missing" is_current_user={false} />);
    expect(screen.getByText("Rollenänderung nicht möglich: Profil fehlt.")).toBeTruthy();
    rerender(<UserRoleChangeControl user_id={adminId} role={null} profile_status="invalid_role" is_current_user={false} />);
    expect(screen.getByText("Rollenänderung nicht möglich: Ungültige Rolle.")).toBeTruthy();
  });

  it("bestätigt Reviewer zu Administrator und sendet exakt die drei freigegebenen Felder", async () => {
    changeUserRoleAction.mockResolvedValue({ success: true, changed: true, code: "role_changed", target_user_id: reviewerId, old_role: "reviewer", new_role: "admin" });
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Rolle ändern" }));
    expect(screen.getByRole("heading", { name: "Benutzer zum Administrator machen?" })).toBeTruthy();
    expect(screen.getByText("Aktuelle Rolle:").nextSibling?.textContent).toBe("Reviewer");
    expect(screen.getByText("Neue Rolle:").nextSibling?.textContent).toBe("Administrator");
    expect(screen.getByText("Dieser Benutzer erhält anschließend Zugriff auf administrative Funktionen.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zum Administrator machen" }));
    await screen.findByRole("status");
    expect(changeUserRoleAction).toHaveBeenCalledWith({ target_user_id: reviewerId, target_role: "admin", expected_current_role: "reviewer" });
    expect(Object.keys(changeUserRoleAction.mock.calls[0][0])).toEqual(["target_user_id", "target_role", "expected_current_role"]);
    expect(screen.getByRole("status").textContent).toBe("Die Benutzerrolle wurde aktualisiert.");
    expect(screen.queryByRole("heading", { name: "Benutzer zum Administrator machen?" })).toBeNull();
  });

  it("warnt vor Admin-Herabstufung und übermittelt die Gegenrolle", async () => {
    changeUserRoleAction.mockResolvedValue({ success: true, changed: false, code: "no_change", target_user_id: adminId, old_role: "admin", new_role: "reviewer" });
    renderControl({ user_id: adminId, role: "admin" });
    fireEvent.click(screen.getByRole("button", { name: "Rolle ändern" }));
    expect(screen.getByRole("heading", { name: "Administrator zum Reviewer herabstufen?" })).toBeTruthy();
    expect(screen.getByText("Warnung:", { exact: false }).textContent).toContain("Der letzte Administrator kann nicht herabgestuft werden.");
    fireEvent.click(screen.getByRole("button", { name: "Zum Reviewer machen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Die Benutzerrolle ist bereits aktuell."));
    expect(screen.queryByText("Die Benutzerrolle wurde aktualisiert.")).toBeNull();
    expect(changeUserRoleAction).toHaveBeenCalledWith({ target_user_id: adminId, target_role: "reviewer", expected_current_role: "admin" });
  });

  it("sperrt nur das betroffene Control während Pending und verhindert Doppelsubmit", async () => {
    let resolve!: (value: unknown) => void;
    changeUserRoleAction.mockImplementation(() => new Promise((done) => { resolve = done; }));
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Rolle ändern" }));
    const form = screen.getByRole("button", { name: "Zum Administrator machen" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByText("Wird aktualisiert …")).toBeTruthy();
    expect(form.parentElement?.getAttribute("aria-busy")).toBe("true");
    for (const button of within(form).getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
    expect(changeUserRoleAction).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true, changed: true, code: "role_changed", target_user_id: reviewerId, old_role: "reviewer", new_role: "admin" }));
  });

  it.each([
    ["user_role_forbidden", "Der Zugriff ist nicht erlaubt."],
    ["user_not_found", "Für diesen Benutzer ist kein gültiges Profil vorhanden."],
    ["user_role_invalid", "Die angeforderte Benutzerrolle ist ungültig."],
    ["user_role_conflict", "Die Rolle wurde zwischenzeitlich geändert. Bitte lade die Benutzerliste neu."],
    ["last_admin_protected", "Der letzte Administrator kann nicht zum Reviewer herabgestuft werden."],
    ["self_role_change_blocked", "Du kannst deine eigene Rolle nicht ändern."],
    ["user_role_change_failed", "Die Benutzerrolle konnte nicht aktualisiert werden."],
  ] as const)("mappt %s neutral als zeilenisolierten Alert", async (code, text) => {
    changeUserRoleAction.mockResolvedValue({ success: false, code, error: "technisches Detail" });
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Rolle ändern" }));
    fireEvent.click(screen.getByRole("button", { name: "Zum Administrator machen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(text);
    expect(alert.textContent).not.toContain(code);
    expect(screen.queryByRole("heading", { name: "Benutzer zum Administrator machen?" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("isoliert Controls und gibt nach Abbruch den Fokus zurück", async () => {
    render(<><UserRoleChangeControl user_id={reviewerId} role="reviewer" profile_status="active" is_current_user={false} /><UserRoleChangeControl user_id={adminId} role="admin" profile_status="active" is_current_user={false} /></>);
    const openers = screen.getAllByRole("button", { name: "Rolle ändern" });
    fireEvent.click(openers[0]);
    expect(screen.getAllByRole("button", { name: "Rolle ändern" })).toHaveLength(1);
    expect(document.body.contains(openers[1])).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole("button", { name: "Rolle ändern" })[0]));
    expect(screen.queryByRole("heading", { name: "Benutzer zum Administrator machen?" })).toBeNull();
  });
});

describe("Role Change UI architecture", () => {
  const control = readFileSync("app/(app)/admin/users/user-role-change-control.tsx", "utf8");
  const action = readFileSync("lib/actions/user-role-change.ts", "utf8");
  const migration = readFileSync("supabase/migrations/202607310001_user_role_change_rpc.sql", "utf8");
  it("verwendet die bestehende Action ohne neue Mutation oder Revalidation", () => {
    expect(control).toContain("changeUserRoleAction({");
    expect(control).not.toMatch(/router\.refresh|revalidatePath|redirect\(|auth\.admin|service_role|SUPABASE_SERVICE_ROLE|from\(["']profiles["']\)\.update/i);
    expect(control).not.toMatch(/email|actor_id|patch/i);
    expect(action).toContain('if (result.success && result.changed) revalidatePath("/admin/users")');
  });
  it("belässt Self-Change-Sperren in Action-Service und RPC als Sicherheitsgrenze", () => {
    expect(action).toContain("changeUserRole(input, source)");
    expect(migration).toContain("if actor_id = target_user_id then");
    expect(migration).toContain("self_change_blocked");
  });
});
