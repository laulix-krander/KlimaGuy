import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { OrphanInventoryView } from "@/app/(app)/admin/project-media/orphans/orphan-inventory-view";

const base = { page: 1, page_size: 50 as const, total_count: 0, total_pages: 0, filter: "all" as const };
const item = {
  media_id: "33333333-3333-4333-8333-333333333333",
  project_id: "22222222-2222-4222-8222-222222222222",
  project_title: "Projekt Nord",
  upload_status: "pending" as const,
  created_at: "2026-07-28T11:00:00.000Z",
  age_hours: 25,
  mime_type: "image/jpeg",
  file_size_bytes: 1234,
  classification: "pending_orphan_candidate" as const,
  diagnostic_code: "pending_orphan_candidate" as const,
};

describe("Admin-Medien-Inventur UI", () => {
  it("zeigt Diagnosehinweis, Filter und Empty State", () => {
    render(<OrphanInventoryView data={{ ...base, items: [] }} />);
    expect(screen.getByText(/Inventur zeigt ausschließlich mindestens 24 Stunden alte/)).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("all");
    expect(screen.getByText("Keine verwaisten Upload-Kandidaten gefunden.")).toBeTruthy();
  });
  it("zeigt die Adminaktion erst nach expliziter Auswahl und verlangt eine klare Bestätigung", () => {
    render(<OrphanInventoryView canClaim data={{ ...base, total_count: 1, total_pages: 1, items: [item] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Fachlich bereinigen" }));
    expect(screen.getByText(/physische Datei bleibt bis zu einem späteren kontrollierten Purge/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fachlich bereinigen" })).toBeTruthy();
  });
  it("rendert das schmale Kandidaten-DTO ohne verbotene Aktionen", () => {
    render(<OrphanInventoryView data={{ ...base, total_count: 1, total_pages: 1, items: [item] }} />);
    expect(screen.getByText("Pending-Kandidat")).toBeTruthy();
    expect(screen.getByText("Projekt Nord")).toBeTruthy();
    for (const action of ["Löschen", "Cleanup", "Retry", "Purge", "Restore", "Download"]) {
      expect(screen.queryByRole("button", { name: action })).toBeNull();
      expect(screen.queryByRole("link", { name: action })).toBeNull();
    }
  });
  it("rendert stabile Seitennavigation mit aktivem Filter", () => {
    render(<OrphanInventoryView data={{ ...base, page: 2, total_count: 120, total_pages: 3, filter: "failed", items: [item] }} />);
    expect(screen.getByRole("link", { name: "Vorherige Seite" }).getAttribute("href")).toBe("/admin/project-media/orphans?page=1&status=failed");
    expect(screen.getByRole("link", { name: "Nächste Seite" }).getAttribute("href")).toBe("/admin/project-media/orphans?page=3&status=failed");
  });
  it("implementiert Pending-, Doppelabsende-, Erfolgs-, Konflikt- und Fehlerzustände ohne optimistische Entfernung", () => {
    const control = readFileSync("app/(app)/admin/project-media/orphans/orphan-claim-control.tsx", "utf8");
    expect(control).toContain('aria-busy={pending}');
    expect(control.match(/aria-disabled=\{pending\}/g)).toHaveLength(2);
    expect(control.match(/ disabled=\{pending\}/g)).toHaveLength(2);
    expect(control).toContain("Wird bereinigt …");
    expect(control).toContain("Der verwaiste Upload wurde fachlich bereinigt. Die physische Datei bleibt bis zum späteren Purge gespeichert.");
    expect(control).toContain("Der Upload ist nicht mehr für die Bereinigung geeignet.");
    expect(control).toContain("Der verwaiste Upload konnte nicht fachlich bereinigt werden.");
    expect(control).not.toMatch(/setItems|filter\(.*media|splice\(/);
  });
});
