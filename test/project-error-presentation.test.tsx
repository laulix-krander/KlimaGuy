import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useActionState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectClassForm } from "@/app/(app)/projects/[id]/project-class-form";
import { ProjectHumanReviewForm } from "@/app/(app)/projects/[id]/project-human-review-form";
import { ProjectMetadataForm } from "@/app/(app)/projects/[id]/project-metadata-form";
import { ProjectReviewForm } from "@/app/(app)/projects/[id]/project-review-form";
import { ProjectStatusForm } from "@/app/(app)/projects/[id]/project-status-form";
import { ProjectSummaryForm } from "@/app/(app)/projects/[id]/project-summary-form";
import { ProjectEditForm } from "@/app/(app)/projects/[id]/edit/project-edit-form";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  (globalThis as typeof globalThis & { React: typeof actual }).React = actual;
  return { ...actual, useActionState: vi.fn() };
});

vi.mock("@/lib/actions/projects", () => ({
  updateProjectClassAction: vi.fn(),
  updateProjectCoreAction: vi.fn(),
  updateProjectHumanReviewAction: vi.fn(),
  updateProjectReviewAction: vi.fn(),
  updateProjectStatusAction: vi.fn(),
  updateProjectSummaryAction: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const project = {
  id: projectId,
  title: "Testprojekt",
  installation_address: "Teststraße 1",
  postal_code: "12345",
  city: "Teststadt",
};

function useErrorState(fieldErrors?: Record<string, string[]>): void {
  vi.mocked(useActionState).mockImplementation(() => [
    { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors },
    vi.fn(),
    false,
  ]);
}

function expectErrorRelationship(control: HTMLElement, errorId: string, message: string): void {
  const error = document.getElementById(errorId);

  expect(error?.textContent).toBe(message);
  expect(control.getAttribute("aria-describedby")).toBe(errorId);
  expect(control.getAttribute("aria-invalid")).toBe("true");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("project form error presentation", () => {
  it("uses exactly one alert for a general error in every project editing form", () => {
    const forms = [
      <ProjectEditForm key="edit" project={project} />,
      <ProjectStatusForm key="status" projectId={projectId} status="new" />,
      <ProjectClassForm key="class" projectId={projectId} projectClass="B" />,
      <ProjectSummaryForm key="summary" projectId={projectId} summary="Zusammenfassung" />,
      <ProjectHumanReviewForm key="human-review" projectId={projectId} requiresHumanReview={false} />,
      <ProjectReviewForm key="review" projectId={projectId} projectClass="B" requiresHumanReview status="new" />,
    ];

    useErrorState();
    for (const form of forms) {
      const { unmount } = render(form);
      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.textContent).toBe("Bitte prüfen Sie die markierten Felder.");
      unmount();
    }

    const { container } = render(<ProjectMetadataForm project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten bearbeiten" }));
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it("renders a metadata field error only once and links it to its input", () => {
    useErrorState({ title: ["Projektbezeichnung fehlt."] });
    render(<ProjectMetadataForm project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten bearbeiten" }));

    expectErrorRelationship(screen.getByRole("textbox", { name: "Projektbezeichnung" }), "title-error", "Projektbezeichnung fehlt.");
    expect(screen.getAllByText("Projektbezeichnung fehlt.")).toHaveLength(1);
  });

  it("links the status and summary field errors to their controls", () => {
    useErrorState({ status: ["Status ist ungültig."] });
    const statusRender = render(<ProjectStatusForm projectId={projectId} status="new" />);
    expectErrorRelationship(screen.getByRole("combobox", { name: "Projektstatus" }), "status-error", "Status ist ungültig.");
    statusRender.unmount();

    useErrorState({ summary: ["Zusammenfassung ist ungültig."] });
    render(<ProjectSummaryForm projectId={projectId} summary={null} />);
    expectErrorRelationship(screen.getByRole("textbox", { name: "Projektzusammenfassung" }), "summary-error", "Zusammenfassung ist ungültig.");
  });

  it("links class and Human Review field errors to their fieldsets", () => {
    useErrorState({ project_class: ["Projektklasse fehlt."] });
    const classRender = render(<ProjectClassForm projectId={projectId} projectClass={null} />);
    expectErrorRelationship(screen.getByRole("group", { name: "Projektklasse" }), "project-class-error", "Projektklasse fehlt.");
    classRender.unmount();

    useErrorState({ requires_human_review: ["Human Review fehlt."] });
    render(<ProjectHumanReviewForm projectId={projectId} requiresHumanReview={false} />);
    expectErrorRelationship(screen.getByRole("group", { name: "Human Review" }), "human-review-error", "Human Review fehlt.");
  });

  it("links every combined project review field error to the correct control", () => {
    useErrorState({
      status: ["Status ist ungültig."],
      project_class: ["Projektklasse fehlt."],
      requires_human_review: ["Prüfwert ist ungültig."],
    });
    render(<ProjectReviewForm projectId={projectId} projectClass={null} requiresHumanReview={false} status="new" />);

    expectErrorRelationship(screen.getByRole("combobox", { name: "Projektstatus" }), "review-status-error", "Status ist ungültig.");
    expectErrorRelationship(screen.getByRole("group", { name: "Projektklasse" }), "review-project-class-error", "Projektklasse fehlt.");
    expectErrorRelationship(screen.getByRole("checkbox", { name: "Menschliche Prüfung erforderlich" }), "review-human-review-error", "Prüfwert ist ungültig.");
  });

  it("does not render empty field error elements or error relationships", () => {
    useErrorState();
    const { container } = render(<ProjectEditForm project={project} />);
    const title = screen.getByRole("textbox", { name: "Projektbezeichnung" });

    expect(title.getAttribute("aria-describedby")).toBeNull();
    expect(title.getAttribute("aria-invalid")).toBeNull();
    expect(container.querySelector("#title-error")).toBeNull();
  });
});
