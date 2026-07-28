import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formPath = "app/(app)/projects/[id]/project-media-upload-form.tsx";
const reservationPaths = [
  "lib/actions/project-media-upload-reservation.ts",
  "lib/actions/project-media-upload-reservation-service.ts",
];
const uploadPaths = [
  "lib/actions/project-media-storage-upload.ts",
  "lib/actions/project-media-storage-upload-service.ts",
];
const finalizationPaths = [
  "lib/actions/project-media-upload-finalization.ts",
  "lib/actions/project-media-upload-finalization-service.ts",
];

const read = (path: string) => readFileSync(path, "utf8");
const form = read(formPath);
const uploadFlow = [formPath, ...reservationPaths, ...uploadPaths, ...finalizationPaths]
  .map(read)
  .join("\n");

describe("AP-12-02 Upload-Architekturgrenzen", () => {
  it("importiert genau die drei freigegebenen Actions und ruft sie in der festen Reihenfolge auf", () => {
    const importedActionModules = [...form.matchAll(/from "@\/lib\/actions\/(project-media-[^"]+)"/g)]
      .map((match) => match[1]);
    expect(importedActionModules).toEqual([
      "project-media-upload-finalization",
      "project-media-upload-reservation",
      "project-media-storage-upload",
    ]);

    const reserveAt = form.indexOf("await reserveProjectMediaUploadAction(");
    const uploadAt = form.indexOf("await uploadReservedProjectMediaAction(");
    const finalizeAt = form.indexOf("await finalizeProjectMediaUploadAction(");
    const successAt = form.indexOf('setSuccess("Die Datei wurde erfolgreich hochgeladen.")');
    expect(reserveAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(reserveAt);
    expect(finalizeAt).toBeGreaterThan(uploadAt);
    expect(successAt).toBeGreaterThan(finalizeAt);
    expect(form.match(/await finalizeProjectMediaUploadAction\(/g)).toHaveLength(1);
  });

  it("hält technische Storage- und Identitätsdetails aus der Client-Komponente heraus", () => {
    for (const forbidden of [
      "createClient", "supabase", "crypto.randomUUID", "randomUUID", "storage_bucket",
      "storage_path", "upload_status", "service_role", "SUPABASE_SERVICE_ROLE", "createSignedUrl",
      "getPublicUrl", ".remove(", ".delete(", "upsert",
    ]) expect(form).not.toContain(forbidden);

    expect(form).not.toMatch(/name=["{](?:bucket|path|status|project_id)/);
    expect(form).not.toMatch(/type="hidden"/);
  });

  it("schließt privilegierte, öffentliche und destruktive Storage-Operationen im gesamten Uploadpfad aus", () => {
    for (const forbidden of [
      "service_role", "SUPABASE_SERVICE_ROLE", "createSignedUrl", "getPublicUrl",
      ".remove(", "storage.objects.delete", "upsert: true",
    ]) expect(uploadFlow).not.toContain(forbidden);
  });

  it("trennt Upload, Finalisierung, Revalidation und Soft Delete strikt", () => {
    const reservation = reservationPaths.map(read).join("\n");
    const upload = uploadPaths.map(read).join("\n");
    const finalization = finalizationPaths.map(read).join("\n");

    expect(reservation).not.toContain("revalidatePath");
    expect(upload).not.toContain("revalidatePath");
    expect(upload).not.toContain('upload_status: "ready"');
    expect(finalization).toContain("if (result.success)");
    expect(finalization.indexOf("if (result.success)")).toBeLessThan(finalization.indexOf("revalidatePath(path)"));
    for (const source of [reservation, upload, finalization]) {
      expect(source).not.toContain("soft_delete_project_media");
      expect(source).not.toContain("deleteProjectMedia");
    }
  });
});
