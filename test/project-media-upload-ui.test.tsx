import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { canReserveProjectMediaUpload } from "@/lib/domain/permissions";
import { PROJECT_MEDIA_CATEGORY_LABELS } from "@/lib/domain/mappers";
import { PROJECT_MEDIA_CATEGORIES } from "@/lib/domain/schemas";
import {
  PROJECT_MEDIA_ACCEPT,
  PROJECT_MEDIA_DEFAULT_CATEGORY,
  ProjectMediaUploadForm,
  validateProjectMediaSelection,
} from "@/app/(app)/projects/[id]/project-media-upload-form";

const reserve = vi.fn();
const upload = vi.fn();
const finalize = vi.fn();

vi.mock("@/lib/actions/project-media-upload-reservation", () => ({ reserveProjectMediaUploadAction: (...args: unknown[]) => reserve(...args) }));
vi.mock("@/lib/actions/project-media-storage-upload", () => ({ uploadReservedProjectMediaAction: (...args: unknown[]) => upload(...args) }));
vi.mock("@/lib/actions/project-media-upload-finalization", () => ({ finalizeProjectMediaUploadAction: (...args: unknown[]) => finalize(...args) }));

const projectId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";

function file(name = "anlage.jpg", type = "image/jpeg", size = 100): File {
  const value = new File([new Uint8Array([1])], name, { type });
  Object.defineProperty(value, "size", { value: size });
  return value;
}

function chooseFile(value = file()) {
  fireEvent.change(screen.getByLabelText("Datei"), { target: { files: [value] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  reserve.mockResolvedValue({ success: true, data: { media_id: mediaId } });
  upload.mockResolvedValue({ success: true, data: { media_id: mediaId } });
  finalize.mockResolvedValue({ success: true, data: { media_id: mediaId } });
});

describe("Berechtigung und Formularumfang", () => {
  it("verwendet die zentrale Admin-Berechtigung und bindet die UI daran", () => {
    expect(canReserveProjectMediaUpload("admin")).toBe(true);
    expect(canReserveProjectMediaUpload("reviewer")).toBe(false);
    const page = readFileSync("app/(app)/projects/[id]/page.tsx", "utf8");
    expect(page).toContain("canReserveProjectMediaUpload(parsedRole.data)");
    expect(page).toContain("mayUploadProjectMedia ? (");
  });

  it("zeigt genau ein einzelnes Dateifeld, accept und alle zentralen Kategorien", () => {
    const { container } = render(<ProjectMediaUploadForm projectId={projectId} />);
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].hasAttribute("multiple")).toBe(false);
    expect(inputs[0].getAttribute("accept")).toBe(PROJECT_MEDIA_ACCEPT);
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("value"))).toEqual([...PROJECT_MEDIA_CATEGORIES]);
    expect(options.map((option) => option.textContent)).toEqual(PROJECT_MEDIA_CATEGORIES.map((category) => PROJECT_MEDIA_CATEGORY_LABELS[category]));
    expect(container.querySelector('[name="storage_bucket"], [name="storage_path"], [name="project_id"]')).toBeNull();
  });
});

describe("Clientvorvalidierung", () => {
  it("weist fehlende, leere und nicht unterstützte Dateien zurück", () => {
    expect(validateProjectMediaSelection(null, "other").file).toMatch(/wählen/);
    expect(validateProjectMediaSelection(file("leer.png", "image/png", 0), "other").file).toMatch(/leer/);
    expect(validateProjectMediaSelection(file("text.txt", "text/plain", 10), "other").file).toMatch(/nicht unterstützt/);
  });

  it.each([
    ["image/jpeg", 15_000_000, true],
    ["image/jpeg", 15_000_001, false],
    ["application/pdf", 25_000_000, true],
    ["application/pdf", 25_000_001, false],
  ] as const)("prüft die exakte Grenze für %s bei %i Bytes", (type, size, allowed) => {
    expect(validateProjectMediaSelection(file("datei", type, size), "other").file === undefined).toBe(allowed);
  });

  it("fordert eine zentrale Kategorie", () => {
    expect(validateProjectMediaSelection(file(), "").category).toMatch(/Kategorie/);
  });
});

describe("Orchestrierung, Pending und Erfolg", () => {
  it("führt Reservierung, Upload und Finalisierung strikt nacheinander mit engen Eingaben aus", async () => {
    const order: string[] = [];
    reserve.mockImplementation(async () => { order.push("reserve"); return { success: true, data: { media_id: mediaId } }; });
    upload.mockImplementation(async () => { order.push("upload"); return { success: true, data: { media_id: mediaId } }; });
    finalize.mockImplementation(async () => { order.push("finalize"); return { success: true, data: { media_id: mediaId } }; });
    const { container } = render(<ProjectMediaUploadForm projectId={projectId} />);
    const selected = file();
    chooseFile(selected);
    fireEvent.click(screen.getByRole("button", { name: "Datei hochladen" }));

    await screen.findByText("Die Datei wurde erfolgreich hochgeladen.");
    expect(order).toEqual(["reserve", "upload", "finalize"]);
    expect(reserve).toHaveBeenCalledWith({ project_id: projectId, original_filename: selected.name, mime_type: selected.type, file_size_bytes: selected.size, category: "other", source: "manual_upload" });
    const uploadData = upload.mock.calls[0][0] as FormData;
    expect([...uploadData.keys()]).toEqual(["media_id", "project_id", "file"]);
    expect(uploadData.get("media_id")).toBe(mediaId);
    expect(uploadData.get("project_id")).toBe(projectId);
    expect(uploadData.get("file")).toBe(selected);
    expect(finalize).toHaveBeenCalledWith({ media_id: mediaId, project_id: projectId });
    expect((screen.getByLabelText("Primärkategorie") as HTMLSelectElement).value).toBe(PROJECT_MEDIA_DEFAULT_CATEGORY);
    fireEvent.click(screen.getByRole("button", { name: "Datei hochladen" }));
    expect(await screen.findByText("Bitte wählen Sie eine Datei aus.")).not.toBeNull();
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("sperrt das gesamte Formular und einen zweiten Submit während des gemeinsamen Pending-Zustands", async () => {
    let release: ((value: unknown) => void) | undefined;
    reserve.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { container } = render(<ProjectMediaUploadForm projectId={projectId} />);
    chooseFile();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(container.querySelector("form")?.getAttribute("aria-busy")).toBe("true"));
    expect((screen.getByLabelText("Datei") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Primärkategorie") as HTMLSelectElement).disabled).toBe(true);
    const button = screen.getByRole("button", { name: "Wird hochgeladen …" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.submit(container.querySelector("form")!);
    expect(reserve).toHaveBeenCalledTimes(1);
    release?.({ success: false, error: "Reservierung fehlgeschlagen." });
    await screen.findByRole("alert");
  });

  it.each(["reserve", "upload", "finalize"] as const)("stoppt bei einem Fehler in %s ohne Reset oder falschen Erfolg", async (step) => {
    if (step === "reserve") reserve.mockResolvedValue({ success: false, error: "Reservierung fehlgeschlagen." });
    if (step === "upload") upload.mockResolvedValue({ success: false, code: "storage_conflict", error: "Für diese Reservierung wurde bereits eine Datei hochgeladen." });
    if (step === "finalize") finalize.mockResolvedValue({ success: false, error: "Finalisierung fehlgeschlagen." });
    render(<ProjectMediaUploadForm projectId={projectId} />);
    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Datei hochladen" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.queryByText("Die Datei wurde erfolgreich hochgeladen.")).toBeNull();
    expect((screen.getByLabelText("Datei") as HTMLInputElement).files).toHaveLength(1);
    if (step === "reserve") expect(upload).not.toHaveBeenCalled();
    if (step !== "finalize") expect(finalize).not.toHaveBeenCalled();
  });

  it("validiert vor der Reservierung und bewahrt Eingaben nach Fehlern", async () => {
    render(<ProjectMediaUploadForm projectId={projectId} />);
    fireEvent.click(screen.getByRole("button", { name: "Datei hochladen" }));
    expect(await screen.findByText("Bitte wählen Sie eine Datei aus.")).not.toBeNull();
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe("Scope", () => {
  it("enthält keine direkte Storage-Nutzung, Mehrfachauswahl, Vorschau, URL oder Downloadfunktion", () => {
    const source = readFileSync("app/(app)/projects/[id]/project-media-upload-form.tsx", "utf8");
    for (const forbidden of ["supabase.storage", "createSigned" + "Url", "getPublic" + "Url", "storage_bucket", "storage_path", "multiple=", "dropzone", "download="]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
