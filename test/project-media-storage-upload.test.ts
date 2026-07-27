import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  detectProjectMediaMimeType,
  type ProjectMediaStorageUploadDataSource,
  type ProjectMediaUploadFile,
  type ReservedProjectMedia,
  uploadReservedProjectMediaWithDataSource,
} from "@/lib/actions/project-media-storage-upload-service";
import { uploadReservedProjectMediaSchema } from "@/lib/domain/schemas";

const projectId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const signatures = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
} as const;

function fakeFile(type = "image/jpeg", size = 100, bytes: readonly number[] = signatures["image/jpeg"], name = "client-name.jpg"): ProjectMediaUploadFile {
  return {
    name, type, size,
    slice: () => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer }),
  };
}

const baseReservation: ReservedProjectMedia = {
  id: mediaId, project_id: projectId, storage_bucket: "project-media",
  storage_path: `projects/${projectId}/originals/${mediaId}/server-name.jpg`,
  stored_filename: "server-name.jpg", mime_type: "image/jpeg", file_size_bytes: 100,
  uploaded_by: userId, upload_status: "pending", deleted_at: null,
};

function setup(options: {
  authenticated?: boolean; role?: string | null; project?: boolean;
  reservation?: ReservedProjectMedia | null; storageError?: { statusCode?: string | number; status?: number };
} = {}) {
  const calls = { upload: [] as unknown[][], databaseUpdates: 0, deletes: 0, signedUrls: 0 };
  const source: ProjectMediaStorageUploadDataSource = {
    auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : { id: userId } } }) },
    getProfile: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }),
    getActiveProject: async () => ({ data: options.project === false ? null : { id: projectId }, error: null }),
    getReservation: async () => ({ data: options.reservation === undefined ? baseReservation : options.reservation, error: null }),
    upload: async (...args) => { calls.upload.push(args); return { error: options.storageError ?? null }; },
  };
  return { source, calls };
}

const input = (file: unknown = fakeFile()) => ({ media_id: mediaId, project_id: projectId, file });
const errorCode = async (source: ProjectMediaStorageUploadDataSource, value: unknown) => {
  const result = await uploadReservedProjectMediaWithDataSource(source, value);
  return result.success ? "success" : result.code;
};

describe("uploadReservedProjectMediaSchema", () => {
  it("akzeptiert ausschließlich Medien-ID, Projekt-ID und Datei", () => {
    expect(uploadReservedProjectMediaSchema.safeParse(input()).success).toBe(true);
    expect(uploadReservedProjectMediaSchema.safeParse({ ...input(), storage_path: "client", storage_bucket: "client" }).success).toBe(false);
    expect(uploadReservedProjectMediaSchema.safeParse({ media_id: "x", project_id: projectId, file: fakeFile() }).success).toBe(false);
  });
});

describe("Authentifizierung und Berechtigung", () => {
  it.each([
    [{ authenticated: false }, "not_authenticated"],
    [{ role: null }, "profile_unavailable"],
    [{ role: "inactive" }, "profile_unavailable"],
    [{ role: "reviewer" }, "not_authorized"],
  ] as const)("weist ungültige Identitäten und Rollen ab", async (options, code) => {
    const { source } = setup(options);
    expect(await errorCode(source, input())).toBe(code);
  });
  it("erlaubt Admins", async () => expect(await uploadReservedProjectMediaWithDataSource(setup().source, input())).toMatchObject({ success: true }));
});

describe("Projekt und Reservierung", () => {
  it("erlaubt ein aktives Projekt und eine eigene aktive Pending-Reservierung", async () => {
    expect(await uploadReservedProjectMediaWithDataSource(setup().source, input())).toEqual({ success: true, data: { media_id: mediaId, project_id: projectId, uploaded: true, upload_status: "pending" } });
  });
  it("weist fehlende oder gelöschte Projekte ab", async () => expect(await errorCode(setup({ project: false }).source, input())).toBe("project_unavailable"));
  it("weist fehlende Reservierungen und eine falsche Projektzuordnung ab", async () => {
    expect(await errorCode(setup({ reservation: null }).source, input())).toBe("reservation_missing");
    expect(await errorCode(setup({ reservation: { ...baseReservation, project_id: crypto.randomUUID() } }).source, input())).toBe("reservation_missing");
  });
  it.each([
    [{ uploaded_by: crypto.randomUUID() }, "reservation_owner_mismatch"],
    [{ deleted_at: "2026-07-27T12:00:00Z" }, "reservation_deleted"],
    [{ upload_status: "ready" as const }, "reservation_not_pending"],
    [{ upload_status: "failed" as const }, "reservation_not_pending"],
    [{ storage_bucket: "other" }, "reservation_invalid"],
  ])("weist eine unbrauchbare Reservierung ab", async (patch, code) => {
    expect(await errorCode(setup({ reservation: { ...baseReservation, ...patch } }).source, input())).toBe(code);
  });
});

describe("Dateimetadaten und Produktgrenzen", () => {
  it("weist fehlende und leere Dateien ab", async () => {
    expect(await errorCode(setup().source, { media_id: mediaId, project_id: projectId })).toBe("file_missing");
    expect(await errorCode(setup().source, input(null))).toBe("file_missing");
    expect(await errorCode(setup({ reservation: { ...baseReservation, file_size_bytes: 0 } }).source, input(fakeFile("image/jpeg", 0)))).toBe("file_empty");
  });
  it.each([
    ["image/jpeg", 15_000_000, signatures["image/jpeg"], "success"],
    ["image/jpeg", 15_000_001, signatures["image/jpeg"], "file_too_large"],
    ["application/pdf", 25_000_000, signatures["application/pdf"], "success"],
    ["application/pdf", 25_000_001, signatures["application/pdf"], "file_too_large"],
  ] as const)("prüft exakte Bild- und PDF-Grenzen", async (mime, size, bytes, expected) => {
    const reservation = { ...baseReservation, mime_type: mime, file_size_bytes: size };
    expect(await errorCode(setup({ reservation }).source, input(fakeFile(mime, size, bytes)))).toBe(expected);
  });
  it("verlangt exakte Reservierungsgröße und Browser-MIME", async () => {
    expect(await errorCode(setup().source, input(fakeFile("image/jpeg", 99)))).toBe("file_size_mismatch");
    expect(await errorCode(setup().source, input(fakeFile("image/png", 100, signatures["image/png"])))).toBe("browser_mime_mismatch");
    expect(await errorCode(setup().source, input(fakeFile("image/jpeg", 100)))).toBe("success");
  });
});

describe("Magic Bytes", () => {
  it.each(Object.entries(signatures))("erkennt ein gültiges %s", (mime, bytes) => expect(detectProjectMediaMimeType(Uint8Array.from(bytes))).toBe(mime));
  it.each(["image/jpeg", "image/png", "image/webp", "application/pdf"])("weist eine ungültige %s-Signatur ab", async (mime) => {
    const reservation = { ...baseReservation, mime_type: mime };
    expect(await errorCode(setup({ reservation }).source, input(fakeFile(mime, 100, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])))).toBe("file_signature_mismatch");
  });
  it("weist ein anderes Signaturformat trotz passendem Browser-MIME ab", async () => {
    expect(await errorCode(setup().source, input(fakeFile("image/jpeg", 100, signatures["image/png"])))).toBe("file_signature_mismatch");
  });
});

describe("Storage und Paketgrenzen", () => {
  it("lädt exakt in reservierten Bucket und Pfad ohne Upsert; file.name bleibt irrelevant", async () => {
    const { source, calls } = setup();
    await uploadReservedProjectMediaWithDataSource(source, input(fakeFile("image/jpeg", 100, signatures["image/jpeg"], "not-server-name.png")));
    expect(calls.upload).toEqual([["project-media", baseReservation.storage_path, expect.objectContaining({ name: "not-server-name.png" }), { contentType: "image/jpeg", upsert: false }]]);
    expect(baseReservation.storage_path).toContain(baseReservation.stored_filename);
  });
  it("behandelt Konflikte und Storagefehler neutral und überschreibt nie", async () => {
    expect(await errorCode(setup({ storageError: { statusCode: "409" } }).source, input())).toBe("storage_conflict");
    expect(await errorCode(setup({ storageError: { status: 500 } }).source, input())).toBe("storage_upload_failed");
  });
  it("enthält keine Finalisierung, Revalidation, URLs, Redirects oder Cleanup", () => {
    const service = readFileSync("lib/actions/project-media-storage-upload-service.ts", "utf8");
    const action = readFileSync("lib/actions/project-media-storage-upload.ts", "utf8");
    for (const forbidden of ["createSigned" + "Url", "getPublic" + "Url", "revalidate" + "Path", "redirect" + "(", ".remove" + "(", "upload_status: " + "\"ready\"", "upload_status: " + "\"failed\""]) {
      expect(service + action).not.toContain(forbidden);
    }
    expect(service).not.toContain("update(");
  });
});
