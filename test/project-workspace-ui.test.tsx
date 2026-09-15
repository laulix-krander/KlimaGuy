// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectConversation } from "@/app/(app)/projects/[id]/project-conversation";
import { ProjectFacts } from "@/app/(app)/projects/[id]/project-facts";
import { ProjectPhotoCoverage } from "@/app/(app)/projects/[id]/project-photo-coverage";
import type { ProjectMediaGalleryItem } from "@/lib/actions/project-media-gallery-service";

const projectId = "00000000-0000-4000-8000-000000000001";
const photo = (category: ProjectMediaGalleryItem["category"]): ProjectMediaGalleryItem => ({
  media_id: crypto.randomUUID(), project_id: projectId, category, category_label: category,
  media_type: "image", mime_type: "image/jpeg", file_size_bytes: 1, caption: null,
  created_at: "2026-09-15T00:00:00Z", display_kind: "image", signed_view_url: null,
});

describe("Project Workspace UI", () => {
  it("bietet semantische Überschriften und hilfreiche Empty States", () => {
    render(<><ProjectConversation conversations={[]} /><ProjectFacts facts={[]} /></>);
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeTruthy();
    expect(screen.getByText(/noch keine Conversation/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Angaben & Fakten/i })).toBeTruthy();
    expect(screen.getAllByText("Noch nicht bekannt").length).toBeGreaterThan(0);
  });

  it("zeigt situative Fotos aus derselben Policy als fehlend, vorhanden oder nicht erforderlich", () => {
    render(<ProjectPhotoCoverage
      facts={[{ key: "line_route", value: "offen entlang der Wand" }, { key: "electrical_supply", value: "available" }]}
      media={[photo("pipe_route")]}
    />);
    expect(screen.getByText("Elektroanschluss").parentElement?.textContent).toContain("Erforderlich · fehlt");
    expect(screen.getByText("Leitungsweg").parentElement?.textContent).toContain("Vorhanden · technische Prüfung offen");
    expect(screen.getByText("Kondensatweg").parentElement?.textContent).toContain("Aktuell nicht erforderlich");
  });
});
