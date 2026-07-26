import { fireEvent, render, screen } from "@testing-library/react";
import React, { useActionState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function expectPendingForm(container: HTMLElement): void {
  const form = container.querySelector("form");
  const submit = screen.getByRole("button", { name: "Wird gespeichert …" }) as HTMLButtonElement;

  expect(form?.getAttribute("aria-busy")).toBe("true");
  expect(submit.disabled).toBe(true);
  expect(submit.getAttribute("aria-disabled")).toBe("true");
  expect(submit.textContent).toBe("Wird gespeichert …");
  expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
}

beforeEach(() => {
  vi.mocked(useActionState).mockImplementation((_action, initialState) => [initialState, vi.fn(), true]);
});

describe("project form pending states", () => {
  it("disables every editable field and both buttons in the metadata form", () => {
    const { container } = render(<ProjectMetadataForm project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Stammdaten bearbeiten" }));

    expectPendingForm(container);
    expect(container.querySelectorAll("input:not([type='hidden']):disabled")).toHaveLength(4);
    const cancel = screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables every editable field in the standalone metadata form", () => {
    const { container } = render(<ProjectEditForm project={project} />);

    expectPendingForm(container);
    expect(container.querySelectorAll("input:not([type='hidden']):disabled")).toHaveLength(4);
  });

  it("disables the project status select", () => {
    const { container } = render(<ProjectStatusForm projectId={projectId} status="new" />);

    expectPendingForm(container);
    expect((screen.getByRole("combobox", { name: "Projektstatus" }) as HTMLSelectElement).disabled).toBe(true);
  });

  it("disables all project class radio buttons", () => {
    const { container } = render(<ProjectClassForm projectId={projectId} projectClass="B" />);

    expectPendingForm(container);
    expect(screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
  });

  it("disables the project summary textarea", () => {
    const { container } = render(<ProjectSummaryForm projectId={projectId} summary="Zusammenfassung" />);

    expectPendingForm(container);
    expect((screen.getByRole("textbox", { name: "Projektzusammenfassung" }) as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("disables all Human Review radio buttons", () => {
    const { container } = render(<ProjectHumanReviewForm projectId={projectId} requiresHumanReview={false} />);

    expectPendingForm(container);
    expect(screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
  });

  it("disables the select, radio buttons, and checkbox in the combined review form", () => {
    const { container } = render(
      <ProjectReviewForm projectId={projectId} projectClass="B" requiresHumanReview status="new" />,
    );

    expectPendingForm(container);
    expect((screen.getByRole("combobox", { name: "Projektstatus" }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Menschliche Prüfung erforderlich" }) as HTMLInputElement).disabled).toBe(true);
  });
});
