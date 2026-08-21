import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectMediaGallery } from "@/app/(app)/projects/[id]/project-media-gallery";
import type { ProjectEvidenceDto } from "@/lib/domain/conversation-intelligence/project-evidence";
import type { ProjectMediaGalleryItem } from "@/lib/actions/project-media-gallery-service";

const PROJECT = "11111111-1111-4111-8111-111111111111", MEDIA = "22222222-2222-4222-8222-222222222222", EVIDENCE = "33333333-3333-4333-8333-333333333333";
const image = { media_id: MEDIA, project_id: PROJECT, category: "facade" as const, category_label: "Fassade", media_type: "image" as const, mime_type: "image/jpeg" as const, file_size_bytes: 1000, caption: null, created_at: "2026-08-21T12:00:00.000Z", display_kind: "image" as const, signed_view_url: "https://storage.invalid/image" };
const pdf = { ...image, media_id: "pdf", media_type: "document" as const, mime_type: "application/pdf" as const, display_kind: "pdf" as const };
const dto: ProjectEvidenceDto = { evidence_id: EVIDENCE, project_id: PROJECT, project_media_id: MEDIA, target: "room_overview", purpose: "evaluate_room_dimension_context", source_channel: "internal_upload", source_actor_class: "admin", binding_status: "bound", created_at: "2026-08-21T12:00:00.000Z" };
const result = (items: ProjectMediaGalleryItem[] = [image]) => ({ success: true as const, data: { items, is_limited: false } });
afterEach(cleanup);

async function selectAndConfirm(action = vi.fn().mockResolvedValue({ success: true, result: "bound", data: dto })) {
  render(<ProjectMediaGallery bindEvidence={action} mayBindEvidence result={result()} />);
  fireEvent.click(screen.getByRole("button", { name: "Als Evidence verwenden" }));
  const target = screen.getByLabelText("Evidence Target");
  expect(within(target).getAllByRole("option").map((option) => option.textContent)).toEqual(["Bitte wählen", "Raumübersicht", "Innenbereich", "Außenbereich", "Leitungsweg", "Elektrobereich", "Zugänglichkeit"]);
  fireEvent.change(target, { target: { value: "outdoor_area_overview" } });
  expect(screen.getByLabelText("Purpose")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "evaluate_accessibility_context" } });
  fireEvent.click(screen.getByRole("button", { name: "Auswahl prüfen" }));
  expect(screen.getByRole("heading", { name: "Bild als Evidence verwenden?" })).toBeTruthy();
  expect(screen.getByText("Das Bild wird dadurch noch nicht technisch ausgewertet.")).toBeTruthy();
  return action;
}

describe("interne Evidence-Binding-UX", () => {
  it("zeigt die Action nur dem freigegebenen Admin-Bildpfad, nie Reviewern oder PDFs", () => {
    const { rerender } = render(<ProjectMediaGallery mayBindEvidence={false} result={result()} />);
    expect(screen.queryByRole("button", { name: "Als Evidence verwenden" })).toBeNull();
    rerender(<ProjectMediaGallery bindEvidence={vi.fn()} mayBindEvidence result={result([pdf])} />);
    expect(screen.queryByRole("button", { name: "Als Evidence verwenden" })).toBeNull();
    expect(screen.getByRole("button", { name: "PDF sicher ansehen (öffnet neuen Tab)" })).toBeTruthy();
    rerender(<ProjectMediaGallery bindEvidence={vi.fn()} mayBindEvidence result={result()} />);
    expect(screen.getByRole("button", { name: "Als Evidence verwenden" })).toBeTruthy();
  });
  it("verwendet aktive Registry-Targets, kompatible Purposes und eine explizite Bestätigung", async () => { await selectAndConfirm(); });
  it("bricht ab, schließt den Flow und stellt den Fokus wieder her", () => {
    render(<ProjectMediaGallery bindEvidence={vi.fn()} mayBindEvidence result={result()} />);
    const opener = screen.getByRole("button", { name: "Als Evidence verwenden" }); fireEvent.click(opener); fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Evidence Target")).toBeNull();
    return waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Als Evidence verwenden" })));
  });
  it("sendet exakt Media, Target und Purpose und sperrt synchron gegen Doppelsubmit", async () => {
    let resolve!: (value: { success: true; result: "bound"; data: ProjectEvidenceDto }) => void;
    const action = vi.fn(() => new Promise<{ success: true; result: "bound"; data: ProjectEvidenceDto }>((done) => { resolve = done; })); await selectAndConfirm(action);
    const submit = screen.getByRole("button", { name: "Als Evidence binden" }); fireEvent.click(submit); fireEvent.click(submit);
    expect(action).toHaveBeenCalledTimes(1); expect(action).toHaveBeenCalledWith({ project_media_id: MEDIA, evidence_target: "outdoor_area_overview", purpose: "evaluate_accessibility_context" });
    expect(screen.getByRole("status").textContent).toBe("Evidence wird gebunden …"); expect(submit.getAttribute("aria-disabled")).toBe("true");
    resolve({ success: true, result: "bound", data: { ...dto, target: "outdoor_area_overview", purpose: "evaluate_accessibility_context" } });
    await screen.findByText("Bild wurde als Evidence gebunden. Noch nicht technisch ausgewertet.");
  });
  it("meldet bereits gebunden neutral und Fehler geschlossen", async () => {
    const already = vi.fn().mockResolvedValue({ success: true, result: "already_bound", data: dto }); await selectAndConfirm(already); fireEvent.click(screen.getByRole("button", { name: "Als Evidence binden" }));
    expect(await screen.findByText("Dieses Bild ist für diesen Zweck bereits als Evidence gebunden.")).toBeTruthy(); cleanup();
    const failed = vi.fn().mockResolvedValue({ success: false, code: "project_mismatch", error: "SQL secret" }); await selectAndConfirm(failed); fireEvent.click(screen.getByRole("button", { name: "Als Evidence binden" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Konflikt mit dem Projekt"); expect(screen.queryByText("SQL secret")).toBeNull();
  });
  it("zeigt mehrere Bindings ohne technische IDs mit Availability und bietet gleiche Kombination nicht erneut an", () => {
    const second = { ...dto, evidence_id: "44444444-4444-4444-8444-444444444444", target: "electrical_area" as const, purpose: "evaluate_electrical_context" as const };
    render(<ProjectMediaGallery bindEvidence={vi.fn()} evidenceByMediaId={{ [MEDIA]: [dto, second] }} mayBindEvidence result={result()} />);
    expect(screen.getAllByText("Vorhanden – noch nicht ausgewertet")).toHaveLength(2); expect(screen.queryByText(EVIDENCE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Als Evidence verwenden" }));
    expect(within(screen.getByLabelText("Evidence Target")).queryByRole("option", { name: "Raumübersicht" })).toBeNull();
  });
});
