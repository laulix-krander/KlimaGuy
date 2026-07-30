import { describe, expect, it, vi } from "vitest";
import { canViewProjectMedia } from "@/lib/domain/permissions";
import { getProjectMediaGalleryWithDataSource, PROJECT_MEDIA_SIGNED_URL_TTL_SECONDS, type ProjectMediaGalleryDataSource } from "@/lib/actions/project-media-gallery-service";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";

function source(overrides: Partial<ProjectMediaGalleryDataSource> = {}): ProjectMediaGalleryDataSource {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    getProfile: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
    getActiveProject: vi.fn().mockResolvedValue({ data: { id: PROJECT_ID }, error: null }),
    listMedia: vi.fn().mockResolvedValue({ data: [{ id: MEDIA_ID, project_id: PROJECT_ID, category: "facade", media_type: "image", mime_type: "image/jpeg", file_size_bytes: 1_500_000, caption: null, created_at: "2026-07-30T12:00:00.000Z", storage_bucket: "project-media", storage_path: `${PROJECT_ID}/${MEDIA_ID}.jpg` }], error: null }),
    createSignedUrls: vi.fn().mockResolvedValue({ data: [{ path: `${PROJECT_ID}/${MEDIA_ID}.jpg`, signedUrl: "https://storage.invalid/signed" }], error: null }),
    ...overrides,
  };
}

describe("Projektmedien-Galerie", () => {
  it("erlaubt Admin und Reviewer, aber keine unbekannte Rolle", () => {
    expect(canViewProjectMedia("admin")).toBe(true);
    expect(canViewProjectMedia("reviewer")).toBe(true);
    expect(canViewProjectMedia(null as never)).toBe(false);
  });

  it("mappt ausschließlich das schmale DTO und signiert einmal mit 120 Sekunden", async () => {
    const dataSource = source();
    const result = await getProjectMediaGalleryWithDataSource(dataSource, PROJECT_ID);
    expect(result).toEqual({ success: true, data: { is_limited: false, items: [{ media_id: MEDIA_ID, project_id: PROJECT_ID, category: "facade", category_label: "Fassade", media_type: "image", mime_type: "image/jpeg", file_size_bytes: 1_500_000, caption: null, created_at: "2026-07-30T12:00:00.000Z", display_kind: "image", signed_view_url: "https://storage.invalid/signed" }] } });
    expect(dataSource.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(dataSource.createSignedUrls).toHaveBeenCalledWith("project-media", [`${PROJECT_ID}/${MEDIA_ID}.jpg`], PROJECT_MEDIA_SIGNED_URL_TTL_SECONDS);
  });

  it("verweigert Reviewer nicht, blockiert aber ungültige Profile fail closed", async () => {
    const reviewer = await getProjectMediaGalleryWithDataSource(source({ getProfile: vi.fn().mockResolvedValue({ data: { role: "reviewer" }, error: null }) }), PROJECT_ID);
    expect(reviewer.success).toBe(true);
    const invalid = await getProjectMediaGalleryWithDataSource(source({ getProfile: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }) }), PROJECT_ID);
    expect(invalid).toEqual({ success: false, code: "not_authorized", error: "Zugriff nicht erlaubt." });
  });

  it("liefert bei ungültigen externen Daten nur einen neutralen Fehler", async () => {
    const result = await getProjectMediaGalleryWithDataSource(source({ listMedia: vi.fn().mockResolvedValue({ data: [{ storage_path: "secret" }], error: null }) }), PROJECT_ID);
    expect(result).toEqual({ success: false, code: "load_failed", error: "Medien konnten nicht geladen werden." });
  });
});
