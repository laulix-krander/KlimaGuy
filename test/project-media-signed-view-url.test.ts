import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canViewProjectMedia } from "@/lib/domain/permissions";
import { createProjectMediaSignedViewUrlSchema } from "@/lib/domain/schemas";
import {
  createProjectMediaSignedViewUrlWithDataSource,
  PROJECT_MEDIA_SIGNED_VIEW_URL_TTL_SECONDS,
  type ProjectMediaSignedViewUrlDataSource,
  type ReadyProjectMediaForSignedViewUrl,
} from "@/lib/actions/project-media-signed-view-url-service";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_MEDIA_ID = "88888888-8888-4888-8888-888888888888";
const FILE_ID = "33333333-3333-4333-8333-333333333333";
const SIGNED_URL = "https://storage.invalid/artificial-signed-view";

const media: ReadyProjectMediaForSignedViewUrl = {
  id: MEDIA_ID,
  project_id: PROJECT_ID,
  storage_bucket: "project-media",
  storage_path: `projects/${PROJECT_ID}/originals/${MEDIA_ID}/${FILE_ID}.jpg`,
  mime_type: "image/jpeg",
  media_type: "image",
  upload_status: "ready",
  deleted_at: null,
};

function source(overrides: Partial<ProjectMediaSignedViewUrlDataSource> = {}): ProjectMediaSignedViewUrlDataSource {
  return {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "artificial-user" } }, error: null }),
    getProfile: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
    getActiveProject: vi.fn().mockResolvedValue({ data: { id: PROJECT_ID, deleted_at: null }, error: null }),
    getReadyProjectMedia: vi.fn().mockResolvedValue({ data: media, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: SIGNED_URL }, error: null }),
    ...overrides,
  };
}

const input = { project_id: PROJECT_ID, media_id: MEDIA_ID };

describe("createProjectMediaSignedViewUrlSchema", () => {
  it("akzeptiert ausschließlich zwei gültige UUIDs", () => {
    expect(createProjectMediaSignedViewUrlSchema.safeParse(input).success).toBe(true);
    for (const invalid of [
      { media_id: MEDIA_ID },
      { project_id: PROJECT_ID },
      { ...input, project_id: "invalid" },
      { ...input, media_id: "invalid" },
    ]) expect(createProjectMediaSignedViewUrlSchema.safeParse(invalid).success).toBe(false);
  });

  it.each(["storage_bucket", "storage_path", "ttl", "upload_status", "signed_view_url"])(
    "weist das zusätzliche Feld %s ab",
    (key) => expect(createProjectMediaSignedViewUrlSchema.safeParse({ ...input, [key]: "client-value" }).success).toBe(false),
  );
});

describe("Single-Media-Signed-View-URL-Service", () => {
  it.each(["admin", "reviewer"])("erlaubt die zentrale Permission für %s", async (role) => {
    expect(canViewProjectMedia(role as "admin" | "reviewer")).toBe(true);
    const result = await createProjectMediaSignedViewUrlWithDataSource(source({
      getProfile: vi.fn().mockResolvedValue({ data: { role }, error: null }),
    }), input);
    expect(result.success).toBe(true);
  });

  it.each([
    ["nicht authentifiziert", { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }],
    ["ohne Profil", { getProfile: vi.fn().mockResolvedValue({ data: null, error: null }) }],
    ["mit ungültiger Rolle", { getProfile: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }) }],
  ])("verweigert den Zugriff %s", async (_label, override) => {
    expect(await createProjectMediaSignedViewUrlWithDataSource(source(override), input)).toEqual({
      success: false, code: "signed_url_forbidden", error: "Der Zugriff ist nicht erlaubt.",
    });
  });

  it.each([
    ["fehlend", null],
    ["gelöscht", { id: PROJECT_ID, deleted_at: "2026-07-30T00:00:00.000Z" }],
    ["abweichend", { id: OTHER_PROJECT_ID, deleted_at: null }],
  ])("verweigert ein %s Projekt", async (_label, project) => {
    const result = await createProjectMediaSignedViewUrlWithDataSource(source({
      getActiveProject: vi.fn().mockResolvedValue({ data: project, error: null }),
    }), input);
    expect(result).toMatchObject({ success: false, code: "signed_url_not_found" });
  });

  it("verwendet ausschließlich DB-Bucket und DB-Pfad, exakt 120 Sekunden und antwortet schmal", async () => {
    const dataSource = source();
    const result = await createProjectMediaSignedViewUrlWithDataSource(dataSource, input);
    expect(dataSource.createSignedUrl).toHaveBeenCalledWith(
      media.storage_bucket, media.storage_path, PROJECT_MEDIA_SIGNED_VIEW_URL_TTL_SECONDS,
    );
    expect(PROJECT_MEDIA_SIGNED_VIEW_URL_TTL_SECONDS).toBe(120);
    expect(result).toEqual({ success: true, media_id: MEDIA_ID, signed_view_url: SIGNED_URL, expires_in_seconds: 120 });
    expect(Object.keys(result).sort()).toEqual(["expires_in_seconds", "media_id", "signed_view_url", "success"]);
  });

  it.each([
    ["pending", { upload_status: "pending" }],
    ["failed", { upload_status: "failed" }],
    ["deleted", { deleted_at: "2026-07-30T00:00:00.000Z" }],
    ["falsches Projekt", { project_id: OTHER_PROJECT_ID }],
    ["falsche Medien-ID", { id: OTHER_MEDIA_ID }],
    ["falscher Bucket", { storage_bucket: "public" }],
    ["ungültiger MIME-Type", { mime_type: "text/plain" }],
    ["inkonsistente Typen", { media_type: "document" }],
    ["beliebiger Pfad", { storage_path: "arbitrary.jpg" }],
    ["Traversalpfad", { storage_path: `projects/${PROJECT_ID}/originals/${MEDIA_ID}/../${FILE_ID}.jpg` }],
    ["Pfad eines anderen Projekts", { storage_path: `projects/${OTHER_PROJECT_ID}/originals/${MEDIA_ID}/${FILE_ID}.jpg` }],
    ["Pfad eines anderen Mediums", { storage_path: `projects/${PROJECT_ID}/originals/${OTHER_MEDIA_ID}/${FILE_ID}.jpg` }],
    ["falsche Endung", { storage_path: `projects/${PROJECT_ID}/originals/${MEDIA_ID}/${FILE_ID}.png` }],
  ])("signiert kein Medium: %s", async (_label, changes) => {
    const dataSource = source({
      getReadyProjectMedia: vi.fn().mockResolvedValue({ data: { ...media, ...changes }, error: null }),
    });
    const result = await createProjectMediaSignedViewUrlWithDataSource(dataSource, input);
    expect(result).toMatchObject({ success: false, code: "signed_url_not_available" });
    expect(dataSource.createSignedUrl).not.toHaveBeenCalled();
  });

  it("behandelt ein fehlendes Medium neutral", async () => {
    const result = await createProjectMediaSignedViewUrlWithDataSource(source({
      getReadyProjectMedia: vi.fn().mockResolvedValue({ data: null, error: null }),
    }), input);
    expect(result).toEqual({ success: false, code: "signed_url_not_found", error: "Das Medium ist nicht mehr verfügbar." });
  });

  it.each([
    [{ data: null, error: new Error("artificial provider detail") }],
    [{ data: { signedUrl: "" }, error: null }],
  ])("mappt Signierungsfehler neutral und gibt keine URL aus", async (providerResult) => {
    const result = await createProjectMediaSignedViewUrlWithDataSource(source({
      createSignedUrl: vi.fn().mockResolvedValue(providerResult),
    }), input);
    expect(result).toEqual({ success: false, code: "signed_url_failed", error: "Die Vorschau konnte nicht erneuert werden." });
    expect(JSON.stringify(result)).not.toContain("provider detail");
    expect(result).not.toHaveProperty("signed_view_url");
  });
});

describe("Server-Action-Architektur", () => {
  it("delegiert ohne Revalidation, Redirect, Public URL oder normale Helper-Exports", () => {
    const action = readFileSync("lib/actions/project-media-signed-view-url.ts", "utf8");
    expect(action).toMatch(/^"use server";/);
    expect(action).toContain("createProjectMediaSignedViewUrlWithDataSource");
    expect(action).toContain("createSignedUrl(path, expiresIn)");
    expect(action).not.toMatch(/revalidatePath|redirect\(|getPublicUrl|createSignedUrls|service_role/i);
    expect(action.match(/export (?:async )?function/g)).toHaveLength(1);
  });

  it("ändert weder UI, Migrationen, RPC noch Pakete durch die neue Produktionskette", () => {
    const action = readFileSync("lib/actions/project-media-signed-view-url.ts", "utf8");
    expect(action).not.toMatch(/\.rpc\(|localStorage|sessionStorage/);
    expect(action).not.toMatch(/project-media-image-lightbox|project-media-gallery|project-media-image/);
  });
});
