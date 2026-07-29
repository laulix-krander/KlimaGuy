import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import React from "react";
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
    expect(screen.getByText("Nur Diagnose. Diese Ansicht verändert oder löscht keine Daten.")).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("all");
    expect(screen.getByText("Keine verwaisten Upload-Kandidaten gefunden.")).toBeTruthy();
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
});
