import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canReserveProjectMediaUpload } from "@/lib/domain/permissions";
import { uploadReservationSchema } from "@/lib/domain/schemas";
import { type ProjectMediaInsert, type ReservationDataSource, reserveProjectMediaUploadWithDataSource } from "@/lib/actions/project-media-upload-reservation-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const filenameId = "44444444-4444-4444-8444-444444444444";
const valid = { project_id: projectId, original_filename: " Anlage.jpg ", mime_type: "image/jpeg", file_size_bytes: 15_000_000, category: "indoor_area", source: "manual_upload" };

function source(options: { user?: boolean; role?: string | null; project?: boolean; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectMediaInsert | undefined, storage: 0, signedUrl: 0 };
  const dataSource: ReservationDataSource = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId } } }) },
    getProfile: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }),
    getActiveProject: async () => ({ data: options.project === false ? null : { id: projectId }, error: null }),
    insertProjectMedia: async (payload) => {
      calls.payload = payload;
      const insertResult = { data: null, error: options.error ?? null };
      return { data: insertResult.error ? null : { id: payload.id }, error: insertResult.error };
    },
  };
  return { dataSource, calls };
}
function generators() {
  const ids = [mediaId, filenameId];
  return { uuid: () => ids.shift() ?? crypto.randomUUID(), now: () => "2026-07-27T12:00:00.000Z" };
}

describe("uploadReservationSchema", () => {
  it("validiert Allowlists, Quelle, Kategorie und entfernt zusätzliche Felder", () => {
    expect(uploadReservationSchema.parse({ ...valid, upload_status: "ready", uploaded_by: "client" })).toEqual({ ...valid, original_filename: "Anlage.jpg" });
    for (const mime_type of ["image/gif", "image/svg+xml", "text/plain"]) expect(uploadReservationSchema.safeParse({ ...valid, mime_type }).success).toBe(false);
    expect(uploadReservationSchema.safeParse({ ...valid, category: "free" }).success).toBe(false);
    expect(uploadReservationSchema.safeParse({ ...valid, source: "whatsapp" }).success).toBe(false);
  });
  it("erzwingt Dateinamen- und exakte Größengrenzen", () => {
    for (const original_filename of ["", ".", "../x.jpg", "x\\y.jpg", "x\u0000.jpg", "a".repeat(256)]) expect(uploadReservationSchema.safeParse({ ...valid, original_filename }).success).toBe(false);
    expect(uploadReservationSchema.safeParse({ ...valid, file_size_bytes: 15_000_001 }).success).toBe(false);
    expect(uploadReservationSchema.safeParse({ ...valid, mime_type: "application/pdf", file_size_bytes: 25_000_000 }).success).toBe(true);
    expect(uploadReservationSchema.safeParse({ ...valid, mime_type: "application/pdf", file_size_bytes: 25_000_001 }).success).toBe(false);
    expect(uploadReservationSchema.safeParse({ ...valid, file_size_bytes: 0 }).success).toBe(false);
  });
});

describe("Upload-Reservierungsberechtigung", () => {
  it("erlaubt ausschließlich Admins", () => { expect(canReserveProjectMediaUpload("admin")).toBe(true); expect(canReserveProjectMediaUpload("reviewer")).toBe(false); });
  it("weist fehlende Authentifizierung, Profile und Rollen ab", async () => {
    await expect(reserveProjectMediaUploadWithDataSource(source({ user: false }).dataSource, valid)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(reserveProjectMediaUploadWithDataSource(source({ role: null }).dataSource, valid)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(reserveProjectMediaUploadWithDataSource(source({ role: "reviewer" }).dataSource, valid)).resolves.toMatchObject({ success: false, error: "Sie sind nicht berechtigt, Medienuploads zu reservieren." });
  });
});

describe("Upload-Reservierungsservice", () => {
  it("prüft das aktive Projekt", async () => await expect(reserveProjectMediaUploadWithDataSource(source({ project: false }).dataSource, valid)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." }));
  it("generiert UUID-Dateiname, kanonischen Pfad, pending-Status und Response", async () => {
    const mock = source();
    const result = await reserveProjectMediaUploadWithDataSource(mock.dataSource, valid, generators());
    const stored = `${filenameId}.jpg`; const path = `projects/${projectId}/originals/${mediaId}/${stored}`;
    expect(result).toEqual({ success: true, data: { media_id: mediaId, storage_bucket: "project-media", storage_path: path, stored_filename: stored, max_file_size: 15_000_000, expected_mime: "image/jpeg" } });
    expect(mock.calls.payload).toMatchObject({ id: mediaId, stored_filename: stored, storage_path: path, upload_status: "pending", uploaded_by: userId, created_at: "2026-07-27T12:00:00.000Z" });
  });
  it("behandelt einen INSERT ohne PostgREST-Zeile mit der serverseitigen mediaId als Erfolg", async () => {
    const result = await reserveProjectMediaUploadWithDataSource(source().dataSource, valid, generators());
    expect(result).toMatchObject({ success: true, data: { media_id: mediaId } });
  });
  it("behandelt einen echten INSERT-Fehler weiterhin als Reservierungsfehler", async () => {
    const result = await reserveProjectMediaUploadWithDataSource(source({ error: { code: "42501" } }).dataSource, valid, generators());
    expect(result).toEqual({ success: false, error: "Der Upload konnte nicht reserviert werden. Bitte versuchen Sie es erneut." });
  });
  it("verhindert Mass Assignment durch eine exakt erlaubte INSERT-Payload", async () => {
    const mock = source();
    await reserveProjectMediaUploadWithDataSource(mock.dataSource, { ...valid, id: "client", storage_path: "evil", media_type: "document", created_at: "client", deleted_at: "client", caption: "client" });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["category", "created_at", "file_size_bytes", "id", "media_type", "mime_type", "original_filename", "project_id", "source", "storage_bucket", "storage_path", "stored_filename", "upload_status", "uploaded_by"].sort());
  });
  it("führt weder Storage-Upload noch Bucket-Write noch Signed-URL-Erzeugung aus", async () => {
    const mock = source(); await reserveProjectMediaUploadWithDataSource(mock.dataSource, valid);
    expect(mock.calls.storage).toBe(0); expect(mock.calls.signedUrl).toBe(0); expect(mock.calls.payload).toBeDefined();
  });
});

describe("Production-Reservierungsadapter", () => {
  const adapter = readFileSync("lib/actions/project-media-upload-reservation.ts", "utf8");

  it("liest die pending-Zeile nach dem INSERT nicht zurück", () => {
    expect(adapter).toContain('.from("project_media").insert(payload)');
    expect(adapter).not.toMatch(/insert\(payload\)[\s\S]*?\.(?:select|single|maybeSingle)\s*\(/);
  });

  it("mappt ausschließlich den INSERT-Fehler und verwendet bei Erfolg payload.id", () => {
    expect(adapter).toContain("const { error } = await supabase.from(\"project_media\").insert(payload);");
    expect(adapter).toContain("return { data: error ? null : { id: payload.id }, error };");
  });

  it("enthält weder Storage-, Signed-URL- noch Service-Role-Zugriffe", () => {
    expect(adapter).not.toMatch(/\.storage\b|createSignedUrl|service_role|SUPABASE_SERVICE_ROLE/);
  });
});
