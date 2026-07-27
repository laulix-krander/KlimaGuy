import { act, fireEvent, render, screen } from "@testing-library/react";
import React, { useActionState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectClassForm } from "@/app/(app)/projects/[id]/project-class-form";
import { ProjectHumanReviewForm } from "@/app/(app)/projects/[id]/project-human-review-form";
import { ProjectStatusForm } from "@/app/(app)/projects/[id]/project-status-form";
import { ProjectSummaryForm } from "@/app/(app)/projects/[id]/project-summary-form";
import { ProjectMetadataForm } from "@/app/(app)/projects/[id]/project-metadata-form";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  (globalThis as typeof globalThis & { React: typeof actual }).React = actual;
  return { ...actual, useActionState: vi.fn() };
});

vi.mock("@/lib/actions/projects", () => ({
  updateProjectClassAction: vi.fn(),
  updateProjectHumanReviewAction: vi.fn(),
  updateProjectCoreAction: vi.fn(),
  updateProjectStatusAction: vi.fn(),
  updateProjectSummaryAction: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
let actionState: { success: boolean; error?: string; fieldErrors?: Record<string, string[]> };
let pending: boolean;

beforeEach(() => {
  actionState = { success: false, error: "" };
  pending = false;
  vi.mocked(useActionState).mockImplementation(() => [actionState, vi.fn(), pending]);
});

describe("project form state handling", () => {
  it("closes cleanly after successful metadata saving", async () => {
    const project = { id: projectId, title: "Serverwert", installation_address: null, postal_code: null, city: null };
    const view = render(<ProjectMetadataForm project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten bearbeiten" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Projektbezeichnung" }), { target: { value: "Entwurf" } });

    actionState = { success: true };
    await act(async () => view.rerender(<ProjectMetadataForm project={project} />));

    expect(screen.queryByRole("textbox", { name: "Projektbezeichnung" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten bearbeiten" }));
    expect((screen.getByRole("textbox", { name: "Projektbezeichnung" }) as HTMLInputElement).value).toBe("Serverwert");
  });

  it("keeps edited values plus field and general errors after a failed request", () => {
    const view = render(<ProjectSummaryForm projectId={projectId} summary="Serverwert" />);
    const summary = screen.getByRole("textbox", { name: "Projektzusammenfassung" }) as HTMLTextAreaElement;
    fireEvent.change(summary, { target: { value: "Nicht gespeicherter Entwurf" } });

    pending = true;
    view.rerender(<ProjectSummaryForm projectId={projectId} summary="Serverwert" />);
    expect(summary.value).toBe("Nicht gespeicherter Entwurf");
    expect(summary.disabled).toBe(true);

    actionState = {
      success: false,
      error: "Bitte prüfen Sie die markierten Felder.",
      fieldErrors: { summary: ["Die Zusammenfassung ist zu lang."] },
    };
    pending = false;
    view.rerender(<ProjectSummaryForm projectId={projectId} summary="Serverwert" />);

    expect(summary.value).toBe("Nicht gespeicherter Entwurf");
    expect(summary.disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("Bitte prüfen Sie die markierten Felder.");
    expect(screen.getByText("Die Zusammenfassung ist zu lang.")).toBeTruthy();
  });

  it("resets changed controls and removes stale errors after pending succeeds", async () => {
    const view = render(<ProjectClassForm projectId={projectId} projectClass="B" />);
    const optionC = screen.getByRole("radio", { name: /C –/ }) as HTMLInputElement;
    fireEvent.click(optionC);

    actionState = { success: false, error: "Speichern fehlgeschlagen.", fieldErrors: { project_class: ["Ungültige Klasse."] } };
    pending = true;
    view.rerender(<ProjectClassForm projectId={projectId} projectClass="B" />);
    expect(screen.getByRole("alert")).toBeTruthy();

    actionState = { success: true };
    pending = false;
    await act(async () => view.rerender(<ProjectClassForm projectId={projectId} projectClass="B" />));

    expect((screen.getByRole("radio", { name: /B –/ }) as HTMLInputElement).checked).toBe(true);
    expect(optionC.checked).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Ungültige Klasse.")).toBeNull();
    expect(screen.getByRole("button", { name: "Projektklasse speichern" })).toBeTruthy();
  });

  it("shows a neutral conflict error without an ambiguous success indication", () => {
    actionState = { success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." };
    render(<ProjectStatusForm projectId={projectId} status="new" />);

    expect(screen.getByRole("alert").textContent).toBe("Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Status speichern" })).toBeTruthy();
  });

  it("resets status, summary, and Human Review controls on success", async () => {
    const cases = [
      {
        element: () => <ProjectStatusForm projectId={projectId} status="new" />,
        change: () => fireEvent.change(screen.getByRole("combobox"), { target: { value: "collecting_information" } }),
        original: () => (screen.getByRole("combobox") as HTMLSelectElement).value === "new",
      },
      {
        element: () => <ProjectSummaryForm projectId={projectId} summary="Serverwert" />,
        change: () => fireEvent.change(screen.getByRole("textbox"), { target: { value: "Entwurf" } }),
        original: () => (screen.getByRole("textbox") as HTMLTextAreaElement).value === "Serverwert",
      },
      {
        element: () => <ProjectHumanReviewForm projectId={projectId} requiresHumanReview={false} />,
        change: () => fireEvent.click(screen.getByRole("radio", { name: "Human Review erforderlich" })),
        original: () => (screen.getByRole("radio", { name: "Kein Human Review erforderlich" }) as HTMLInputElement).checked,
      },
    ];

    for (const testCase of cases) {
      actionState = { success: false, error: "" };
      const view = render(testCase.element());
      testCase.change();
      expect(testCase.original()).toBe(false);

      actionState = { success: true };
      await act(async () => view.rerender(testCase.element()));
      expect(testCase.original()).toBe(true);
      view.unmount();
    }
  });
});
