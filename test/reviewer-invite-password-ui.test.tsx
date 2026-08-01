import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ action: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/actions/accept-reviewer-invite", () => ({ acceptReviewerInviteAction: mocks.action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
import { InvitePasswordForm } from "@/app/auth/invite/invite-password-form";

function fill(password = "sicher-passwort", confirmation = password) {
  fireEvent.change(screen.getByLabelText("Neues Passwort"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Passwort wiederholen"), { target: { value: confirmation } });
}

describe("Invite password UI", () => {
  beforeEach(() => { vi.useRealTimers(); mocks.action.mockReset(); mocks.replace.mockReset(); });

  it("zeigt genau zwei zugängliche Passwortfelder und Regeln", () => {
    render(<InvitePasswordForm />);
    const fields = screen.getAllByLabelText(/Passwort/).filter((element) => element.tagName === "INPUT") as HTMLInputElement[];
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.type).toBe("password");
      expect(field.autocomplete).toBe("new-password");
      expect(field.required).toBe(true);
    }
    expect(screen.getByText(/mindestens 8.*höchstens 128/)).toBeTruthy();
    expect(screen.queryByLabelText(/E-Mail|Rolle|Token|User/i)).toBeNull();
  });

  it("meldet Mismatch lokal, fokussiert den Fehler und ruft keine Action auf", async () => {
    render(<InvitePasswordForm />); fill("sicher-passwort", "anderes-passwort");
    fireEvent.submit(screen.getByRole("button", { name: "Passwort speichern" }).closest("form")!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Die Passwörter stimmen nicht überein.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("sperrt synchron Doppelsubmit und alle Controls während Pending", async () => {
    let resolve!: (value: object) => void;
    mocks.action.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<InvitePasswordForm />); fill();
    const form = screen.getByRole("button", { name: "Passwort speichern" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.action).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole("status")).textContent).toBe("Passwort wird gespeichert …");
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByLabelText("Neues Passwort") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Passwort wiederholen") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    resolve({ success: false, code: "invite_password_update_failed", message: "ignored" });
    expect((await screen.findByRole("alert")).textContent).toBe("Das Passwort konnte nicht gespeichert werden.");
  });

  it("leert beide Werte, zeigt Erfolg und leitet kontrolliert weiter", async () => {
    vi.useFakeTimers();
    mocks.action.mockResolvedValue({ success: true, code: "invite_password_updated", message: "ignored" });
    render(<InvitePasswordForm />); fill();
    fireEvent.submit(screen.getByRole("button", { name: "Passwort speichern" }).closest("form")!);
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByRole("status").textContent).toContain("Dein Passwort wurde gespeichert");
    expect(screen.queryByLabelText("Neues Passwort")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/projects");
  });

  it("zeigt Action- und Exceptionfehler neutral ohne automatischen Retry", async () => {
    mocks.action.mockRejectedValue(new Error("provider detail"));
    render(<InvitePasswordForm />); fill();
    fireEvent.submit(screen.getByRole("button", { name: "Passwort speichern" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("Das Passwort konnte nicht gespeichert werden.");
    expect(mocks.action).toHaveBeenCalledOnce();
  });
});
