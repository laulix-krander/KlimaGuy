import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { inviteReviewerAction } = vi.hoisted(() => ({ inviteReviewerAction: vi.fn() }));
vi.mock("@/lib/actions/reviewer-invitation", () => ({ inviteReviewerAction }));

import { ReviewerInvitationControl } from "@/app/(app)/admin/users/reviewer-invitation-control";

function open(email = "reviewer@example.com") {
  const input = screen.getByLabelText("E-Mail-Adresse");
  fireEvent.change(input, { target: { value: email } });
  fireEvent.submit(input.closest("form")!);
  return input;
}

describe("Reviewer Invitation UI", () => {
  beforeEach(() => inviteReviewerAction.mockReset());

  it("zeigt ausschließlich die Reviewer-Eingabe mit Browservalidierung", () => {
    render(<ReviewerInvitationControl />);
    const input = screen.getByLabelText("E-Mail-Adresse") as HTMLInputElement;
    expect(screen.getByRole("heading", { name: "Reviewer einladen" })).toBeTruthy();
    expect(screen.getByText(/ausschließlich Reviewer eingeladen/)).toBeTruthy();
    expect(input.type).toBe("email");
    expect(input.inputMode).toBe("email");
    expect(input.autocomplete).toBe("email");
    expect(input.maxLength).toBe(254);
    expect(input.required).toBe(true);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText(/Passwort/i)).toBeNull();
    expect(screen.queryByText(/Invite-Link|Administrator einladen/i)).toBeNull();
  });

  it("öffnet erst die Bestätigung, sendet beim ersten Submit nicht und führt Fokus zurück", async () => {
    render(<ReviewerInvitationControl />);
    open();
    expect(inviteReviewerAction).not.toHaveBeenCalled();
    expect(screen.getByText("reviewer@example.com")).toBeTruthy();
    expect(screen.getByText("Der eingeladene Benutzer erhält keine Administratorrechte.")).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    expect(inviteReviewerAction).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reviewer einladen" })));
    expect((screen.getByLabelText("E-Mail-Adresse") as HTMLInputElement).value).toBe("reviewer@example.com");
  });


  it("setzt nach bestätigtem Erfolg Formular und Fokus zurück", async () => {
    inviteReviewerAction.mockResolvedValue({ success: true, code: "reviewer_invited", target_user_id: "22222222-2222-4222-8222-222222222222" });
    render(<ReviewerInvitationControl />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Einladung senden" }));
    expect((await screen.findByText("Die Reviewer-Einladung wurde versendet.")).getAttribute("role")).toBe("status");
    expect((screen.getByLabelText("E-Mail-Adresse") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Reviewer wirklich einladen?")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("E-Mail-Adresse")));
    expect(screen.getByRole("region", { name: "Reviewer einladen" }).getAttribute("aria-busy")).toBe("false");
  });

  it.each([
    ["reviewer_already_exists", "Für diese E-Mail-Adresse besteht bereits ein Benutzerkonto."],
    ["reviewer_invitation_pending", "Für diese E-Mail-Adresse besteht bereits eine offene Einladung."],
    ["reviewer_invitation_forbidden", "Der Zugriff ist nicht erlaubt."],
    ["reviewer_invitation_invalid_email", "Bitte gib eine gültige E-Mail-Adresse ein."],
    ["reviewer_invitation_conflict", "Die Einladung konnte wegen eines zwischenzeitlichen Konflikts nicht erstellt werden."],
    ["reviewer_invitation_configuration_error", "Die Einladungsfunktion ist derzeit nicht korrekt konfiguriert."],
    ["reviewer_profile_inconsistent", "Die Einladung wurde erstellt, das Reviewer-Profil konnte jedoch nicht bestätigt werden."],
    ["reviewer_invitation_failed", "Die Reviewer-Einladung konnte nicht versendet werden."],
  ])("mappt %s neutral und behält die Eingabe", async (code, text) => {
    inviteReviewerAction.mockResolvedValue({ success: false, code, message: "nicht anzeigen" });
    render(<ReviewerInvitationControl />);
    open(); fireEvent.click(screen.getByRole("button", { name: "Einladung senden" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(text);
    expect(alert.textContent).not.toContain(code);
    expect((screen.getByLabelText("E-Mail-Adresse") as HTMLInputElement).value).toBe("reviewer@example.com");
    expect(document.activeElement).toBe(alert);
    expect(inviteReviewerAction).toHaveBeenCalledTimes(1);
  });

  it("behandelt Exceptions neutral und entfernt die Meldung beim neuen Versuch", async () => {
    inviteReviewerAction.mockRejectedValueOnce(new Error("provider detail"));
    render(<ReviewerInvitationControl />);
    open(); fireEvent.click(screen.getByRole("button", { name: "Einladung senden" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Die Reviewer-Einladung konnte nicht versendet werden.");
    fireEvent.submit(screen.getByLabelText("E-Mail-Adresse").closest("form")!);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(inviteReviewerAction).toHaveBeenCalledTimes(1);
  });
});

describe("Reviewer Invitation UI Architektur", () => {
  const ui = readFileSync("app/(app)/admin/users/reviewer-invitation-control.tsx", "utf8");
  it("verwendet nur die bestehende Action und keine Backend- oder Browsergrenzen", () => {
    expect(ui).toContain("inviteReviewerAction({ email })");
    expect(ui).toContain("if (submittingRef.current) return");
    expect(ui).toContain("submittingRef.current = true");
    expect(ui).toContain("aria-busy={pending}");
    expect(ui).toContain("disabled={pending}");
    expect(ui).toContain("Einladung wird gesendet …");
    expect(ui).not.toMatch(/auth\.admin|SUPABASE_SERVICE_ROLE|redirectTo|router\.refresh|revalidatePath|localStorage|sessionStorage|password|invite_link|target_role|actor_id|metadata/);
  });
});
