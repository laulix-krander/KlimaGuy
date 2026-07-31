import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectMediaImageLightbox, type ProjectMediaLightboxImage } from "@/app/(app)/projects/[id]/project-media-image-lightbox";
import { ProjectMediaGallery } from "@/app/(app)/projects/[id]/project-media-gallery";


const signedUrlAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/project-media-signed-view-url", () => ({ createProjectMediaSignedViewUrlAction: signedUrlAction }));
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const images: ProjectMediaLightboxImage[] = [
  { project_id: PROJECT_ID, media_id: "image-1", category_label: "Fassade", caption: "Außengerät", preview_url: "https://storage.invalid/one", alt_text: "Außengerät an der Fassade" },
  { project_id: PROJECT_ID, media_id: "image-2", category_label: "Innenraum", caption: null, preview_url: "https://storage.invalid/two", alt_text: "Projektmedium, Kategorie Innenraum" },
];

beforeEach(() => {
  signedUrlAction.mockReset();
  signedUrlAction.mockImplementation(async ({ media_id }: { media_id: string }) => ({ success: true, media_id, signed_view_url: `https://fresh.invalid/${media_id}`, expires_in_seconds: 120 }));
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

async function openFirst() {
  render(<ProjectMediaImageLightbox images={images} initialMediaId="image-1" />);
  const opener = screen.getByRole("button", { name: "Fassade in Bildansicht öffnen" });
  opener.focus();
  fireEvent.keyDown(opener, { key: "Enter" });
  return { dialog: await screen.findByRole("dialog"), opener };
}

describe("Projektmedien-Bild-Lightbox", () => {
  it("öffnet über den semantischen Bildbutton mit Dialogsemantik, Metadaten und Ladezustand", async () => {
    const { dialog } = await openFirst();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Bildansicht Projektmedien" })).toBeTruthy();
    expect(screen.getByText("Bild 1 von 2")).toBeTruthy();
    expect(screen.getByText("Fassade")).toBeTruthy();
    expect(screen.getByText("Außengerät")).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByAltText("Außengerät an der Fassade").getAttribute("src")).toBe("https://fresh.invalid/image-1"));
    expect(signedUrlAction).toHaveBeenCalledWith({ project_id: PROJECT_ID, media_id: "image-1" });
    expect(within(dialog).getByAltText("Außengerät an der Fassade").getAttribute("src")).not.toBe("https://storage.invalid/one");
    expect(screen.getByRole("button", { name: "Vorheriges Bild" }).hasAttribute("disabled")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Schließen" })));
  });

  it("öffnet nativ auch mit Leertaste", async () => {
    render(<ProjectMediaImageLightbox images={images} initialMediaId="image-1" />);
    const opener = screen.getByRole("button", { name: "Fassade in Bildansicht öffnen" });
    fireEvent.keyDown(opener, { key: " " });
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("navigiert sichtbar und mit Pfeiltasten nicht zyklisch in der übergebenen Reihenfolge", async () => {
    await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(screen.getByText("Bild 2 von 2")).toBeTruthy();
    expect(screen.getByText("Innenraum")).toBeTruthy();
    expect(screen.queryByText("Außengerät")).toBeNull();
    expect(screen.getByRole("button", { name: "Nächstes Bild" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("Bild 2 von 2")).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("Bild 1 von 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));
    expect(screen.getByText("Bild 1 von 2")).toBeTruthy();
  });

  it("zeigt Bildfehler neutral und lässt Navigation und Schließen bedienbar", async () => {
    const { dialog } = await openFirst();
    fireEvent.error(within(dialog).getByAltText("Außengerät an der Fassade"));
    expect(screen.getByRole("alert").textContent).toBe("Das Bild konnte nicht geladen werden.");
    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(screen.getByText("Bild 2 von 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
  });

  it("schließt per Escape und gibt Fokus sowie Body-Scroll zurück", async () => {
    const { opener } = await openFirst();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(document.body.style.overflow).toBe("");
  });

  it("schließt am Hintergrund, aber nicht bei Klick innerhalb des Dialogs", async () => {
    await openFirst();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("project-media-lightbox-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("hält Tab und Shift+Tab innerhalb des Dialogs", async () => {
    await openFirst();
    const close = screen.getByRole("button", { name: "Schließen" });
    const next = screen.getByRole("button", { name: "Nächstes Bild" });
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("lässt PDFs außerhalb der Lightbox und zählt sie nicht als Bild", async () => {
    render(<ProjectMediaGallery isAdmin={false} result={{ success: true, data: { is_limited: false, items: [
      { media_id: "image-1", project_id: "project", category: "facade", category_label: "Fassade", media_type: "image", mime_type: "image/jpeg", file_size_bytes: 1000, caption: null, created_at: "2026-07-30T12:00:00.000Z", display_kind: "image", signed_view_url: "https://storage.invalid/one" },
      { media_id: "pdf-1", project_id: "project", category: "other", category_label: "Sonstiges", media_type: "document", mime_type: "application/pdf", file_size_bytes: 1000, caption: null, created_at: "2026-07-30T11:00:00.000Z", display_kind: "pdf", signed_view_url: "https://storage.invalid/pdf" },
    ] } }} />);
    expect(screen.getByRole("button", { name: "PDF sicher ansehen (öffnet neuen Tab)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fassade in Bildansicht öffnen" }));
    expect(await screen.findByText("Bild 1 von 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nächstes Bild" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("Signed-URL-Refresh der Bild-Lightbox", () => {
  it("zeigt Action-Loading, mappt Fehler neutral und lädt beim Retry neu", async () => {
    let resolveRequest!: (value: { success: false; code: "signed_url_failed"; error: string }) => void;
    signedUrlAction.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    await openFirst();
    expect(screen.getByRole("status").textContent).toBe("Vorschau wird vorbereitet …");
    expect(within(screen.getByRole("dialog")).queryByAltText("Außengerät an der Fassade")).toBeNull();
    resolveRequest({ success: false, code: "signed_url_failed", error: "raw provider URL https://secret.invalid" });
    expect((await screen.findByRole("alert")).textContent).toBe("Die Vorschau konnte nicht erneuert werden.");
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(signedUrlAction).toHaveBeenCalledTimes(2));
    expect(await within(screen.getByRole("dialog")).findByAltText("Außengerät an der Fassade")).toBeTruthy();
  });

  it("ignoriert alte Antworten nach Navigation und nach dem Schließen und signiert beim Wiederöffnen neu", async () => {
    const resolvers: Array<(value: { success: true; media_id: string; signed_view_url: string; expires_in_seconds: 120 }) => void> = [];
    signedUrlAction.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const { opener } = await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(screen.getByText("Bild 2 von 2")).toBeTruthy();
    resolvers[0]({ success: true, media_id: "image-1", signed_view_url: "https://stale.invalid/one", expires_in_seconds: 120 });
    expect(within(screen.getByRole("dialog")).queryByAltText("Außengerät an der Fassade")).toBeNull();
    resolvers[1]({ success: true, media_id: "image-2", signed_view_url: "https://fresh.invalid/two", expires_in_seconds: 120 });
    expect((await screen.findByAltText("Projektmedium, Kategorie Innenraum")).getAttribute("src")).toBe("https://fresh.invalid/two");
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(opener);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(signedUrlAction).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    resolvers[2]({ success: true, media_id: "image-1", signed_view_url: "https://late.invalid/one", expires_in_seconds: 120 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
