import { fireEvent, render, screen } from "@testing-library/react";
import React, { useActionState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KlimaGuyOperationsForm } from "@/app/(app)/admin/klimaguy/operations-form";
import { DEFAULT_KLIMAGUY_AGENT_SETTINGS, type EffectiveKlimaGuyAgentSettings } from "@/lib/domain/klimaguy-agent-settings";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  (globalThis as typeof globalThis & { React: typeof actual }).React = actual;
  return { ...actual, useActionState: vi.fn() };
});

vi.mock("@/lib/actions/klimaguy-agent-settings", () => ({
  updateKlimaGuySettingsAction: vi.fn(),
}));

function effective(
  revision: number,
  overrides: Partial<EffectiveKlimaGuyAgentSettings["settings"]> = {},
): EffectiveKlimaGuyAgentSettings {
  return {
    settings: { ...DEFAULT_KLIMAGUY_AGENT_SETTINGS, ...overrides },
    revision,
    persisted: true,
    updatedAt: "2026-09-18T10:00:00.000Z",
  };
}

beforeEach(() => {
  vi.mocked(useActionState).mockReturnValue([
    { success: true, message: "Konfiguration gespeichert." },
    vi.fn(),
    false,
  ]);
});

describe("KlimaGuy Operations form revision", () => {
  it("recreates uncontrolled selects and toggles from newly persisted settings", () => {
    const view = render(<KlimaGuyOperationsForm effective={effective(1)} canManage />);
    const formality = screen.getByRole("combobox", { name: /Anrede/ }) as HTMLSelectElement;
    const responseLength = screen.getByRole("combobox", { name: /Antwortlänge/ }) as HTMLSelectElement;
    const acknowledgement = screen.getByRole("checkbox", { name: /Antworten bestätigen/ }) as HTMLInputElement;

    fireEvent.change(formality, { target: { value: "informal" } });
    fireEvent.change(responseLength, { target: { value: "short" } });
    expect(acknowledgement.checked).toBe(true);

    view.rerender(
      <KlimaGuyOperationsForm
        effective={effective(2, {
          communication_formality: "formal",
          response_length: "balanced",
          acknowledge_answers: false,
        })}
        canManage
      />,
    );

    expect((screen.getByRole("combobox", { name: /Anrede/ }) as HTMLSelectElement).selectedOptions[0]?.textContent).toBe("Sie – professionell");
    expect((screen.getByRole("combobox", { name: /Antwortlänge/ }) as HTMLSelectElement).selectedOptions[0]?.textContent).toBe("Ausgewogen");
    expect((screen.getByRole("checkbox", { name: /Antworten bestätigen/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Konfiguration gespeichert.");
  });

  it("keeps unsaved control values when the persisted revision is unchanged", () => {
    const view = render(<KlimaGuyOperationsForm effective={effective(1)} canManage />);
    const formality = screen.getByRole("combobox", { name: /Anrede/ }) as HTMLSelectElement;
    const acknowledgement = screen.getByRole("checkbox", { name: /Antworten bestätigen/ }) as HTMLInputElement;
    fireEvent.change(formality, { target: { value: "formal" } });
    fireEvent.click(acknowledgement);

    view.rerender(<KlimaGuyOperationsForm effective={effective(1)} canManage />);

    expect((screen.getByRole("combobox", { name: /Anrede/ }) as HTMLSelectElement).value).toBe("formal");
    expect((screen.getByRole("checkbox", { name: /Antworten bestätigen/ }) as HTMLInputElement).checked).toBe(false);
  });
});
