import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectMediaPdfOpenControl } from "@/app/(app)/projects/[id]/project-media-pdf-open-control";

const signedUrlAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/project-media-signed-view-url", () => ({ createProjectMediaSignedViewUrlAction: signedUrlAction }));
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => signedUrlAction.mockReset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("sicheres Öffnen von Projektmedien-PDFs", () => {
  it("reserviert synchron ein opener-loses Tab, verhindert Doppelsubmit und navigiert erst zur neuen URL", async () => {
    let resolve!: (value: { success: true; media_id: string; signed_view_url: string; expires_in_seconds: 120 }) => void;
    signedUrlAction.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const replace = vi.fn();
    const reserved = { opener: window, close: vi.fn(), location: { replace } };
    const open = vi.spyOn(window, "open").mockReturnValue(reserved as unknown as Window);
    render(<ProjectMediaPdfOpenControl mediaId={MEDIA_ID} projectId={PROJECT_ID} />);
    const button = screen.getByRole("button", { name: "PDF sicher ansehen (öffnet neuen Tab)" });
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(reserved.opener).toBeNull();
    expect(screen.getByRole("button", { name: "Dokument wird geöffnet …" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Dokument wird geöffnet …" }));
    expect(signedUrlAction).toHaveBeenCalledTimes(1);
    expect(signedUrlAction).toHaveBeenCalledWith({ project_id: PROJECT_ID, media_id: MEDIA_ID });
    resolve({ success: true, media_id: MEDIA_ID, signed_view_url: "https://fresh.invalid/pdf", expires_in_seconds: 120 });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://fresh.invalid/pdf"));
  });

  it("schließt das reservierte Tab bei Actionfehler und zeigt keine technischen Details", async () => {
    signedUrlAction.mockResolvedValue({ success: false, code: "signed_url_failed", error: "provider secret" });
    const reserved = { opener: window, close: vi.fn(), location: { replace: vi.fn() } };
    vi.spyOn(window, "open").mockReturnValue(reserved as unknown as Window);
    render(<ProjectMediaPdfOpenControl mediaId={MEDIA_ID} projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("alert")).textContent).toBe("Das Dokument konnte nicht geöffnet werden.");
    expect(reserved.close).toHaveBeenCalledOnce();
  });

  it("meldet einen Popupblocker neutral und startet keine Action", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<ProjectMediaPdfOpenControl mediaId={MEDIA_ID} projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("alert").textContent).toContain("Bitte erlaube Pop-ups");
    expect(signedUrlAction).not.toHaveBeenCalled();
  });
});
