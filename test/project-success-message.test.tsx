import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { getProjectSuccessMessage, ProjectSuccessMessage, type ProjectSuccessSearchParams } from "@/app/(app)/projects/[id]/project-success-message";

describe("project success messages", () => {
  it.each<[keyof ProjectSuccessSearchParams, string]>([
    ["created", "Projekt wurde angelegt."],
    ["updated", "Projektdaten wurden aktualisiert."],
    ["status_updated", "Projektstatus wurde aktualisiert."],
    ["class_updated", "Projektklasse wurde aktualisiert."],
    ["summary_updated", "Projektzusammenfassung wurde aktualisiert."],
    ["human_review_updated", "Human Review wurde aktualisiert."],
    ["note_created", "Notiz wurde hinzugefügt."],
    ["note_updated", "Notiz wurde aktualisiert."],
    ["note_deleted", "Notiz wurde gelöscht."],
  ])("maps %s to its success message", (parameter, message) => {
    expect(getProjectSuccessMessage({ [parameter]: "1" })).toBe(message);
  });

  it.each<[keyof ProjectSuccessSearchParams, string]>([
    ["updated", "Projektdaten wurden aktualisiert."],
    ["status_updated", "Projektstatus wurde aktualisiert."],
    ["class_updated", "Projektklasse wurde aktualisiert."],
    ["summary_updated", "Projektzusammenfassung wurde aktualisiert."],
    ["human_review_updated", "Human Review wurde aktualisiert."],
  ])("renders exactly one status for the %s project workflow", (parameter, message) => {
    render(<ProjectSuccessMessage searchParams={{ [parameter]: "1" }} />);

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.textContent).toBe(message);
  });

  it("ignores the removed review_updated parameter", () => {
    const searchParams = { review_updated: "1" } as ProjectSuccessSearchParams;

    expect(getProjectSuccessMessage(searchParams)).toBeNull();
    const { container } = render(<ProjectSuccessMessage searchParams={searchParams} />);
    expect(container.childElementCount).toBe(0);
  });

  it("renders exactly one success message when multiple supported parameters are present", () => {
    render(<ProjectSuccessMessage searchParams={{ updated: "1", status_updated: "1", human_review_updated: "1" }} />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Projektdaten wurden aktualisiert.");
  });

  it("ignores unknown parameters and unsupported values", () => {
    const searchParams = { unknown: "1", updated: "true" } as ProjectSuccessSearchParams;

    expect(getProjectSuccessMessage(searchParams)).toBeNull();
    const { container } = render(<ProjectSuccessMessage searchParams={searchParams} />);
    expect(container.childElementCount).toBe(0);
  });
});
