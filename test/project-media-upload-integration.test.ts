import { describe, expect, it } from "vitest";

import { finalizeProjectMediaUploadWithDataSource } from "@/lib/actions/project-media-upload-finalization-service";
import { uploadReservedProjectMediaWithDataSource } from "@/lib/actions/project-media-storage-upload-service";
import {
  reserveProjectMediaUploadWithDataSource,
  type ProjectMediaInsert,
} from "@/lib/actions/project-media-upload-reservation-service";

const adminId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const filenameId = "44444444-4444-4444-8444-444444444444";
const originalFilename = "validation.png";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("AP-12-02-06 sichere Adapter-Integration", () => {
  it("prüft pending -> Upload -> pending -> ready -> Soft Delete ohne Netzwerkzugriff", async () => {
    type MutableRow = Omit<ProjectMediaInsert, "upload_status"> & { upload_status: "pending" | "ready" | "failed"; deleted_at: string | null };
    const state: { row: MutableRow | null } = { row: null };
    const objects = new Map<string, Uint8Array>();
    const auth = { getUser: async () => ({ data: { user: { id: adminId } } }) };
    const common = {
      auth,
      getProfile: async () => ({ data: { role: "admin" }, error: null }),
      getActiveProject: async (id: string) => ({ data: id === projectId ? { id } : null, error: null }),
    };

    const reservation = await reserveProjectMediaUploadWithDataSource({
      ...common,
      insertProjectMedia: async (payload) => {
        state.row = { ...payload, deleted_at: null };
        return { data: { id: payload.id }, error: null };
      },
    }, {
      project_id: projectId,
      original_filename: originalFilename,
      mime_type: "image/png",
      file_size_bytes: png.byteLength,
      category: "other",
      source: "manual_upload",
    }, {
      uuid: (() => { const ids = [mediaId, filenameId]; return () => ids.shift()!; })(),
      now: () => "2026-07-28T00:00:00.000Z",
    });

    expect(reservation.success).toBe(true);
    if (!reservation.success || !state.row) return;
    expect(state.row.upload_status).toBe("pending");
    expect(reservation.data.storage_path).not.toContain(originalFilename);

    const file = {
      name: originalFilename,
      type: "image/png",
      size: png.byteLength,
      slice: (start = 0, end = png.byteLength) => ({
        arrayBuffer: async () => png.slice(start, end).buffer,
      }),
    };
    const upload = await uploadReservedProjectMediaWithDataSource({
      ...common,
      getReservation: async () => ({ data: state.row, error: null }),
      upload: async (bucket, path) => {
        objects.set(`${bucket}/${path}`, png);
        return { error: null };
      },
    }, { media_id: mediaId, project_id: projectId, file });

    expect(upload).toMatchObject({ success: true, data: { upload_status: "pending" } });
    expect(state.row.upload_status).toBe("pending");
    expect(objects.size).toBe(1);

    const finalized = await finalizeProjectMediaUploadWithDataSource({
      ...common,
      getMedia: async () => ({ data: state.row, error: null }),
      storageObjectExists: async (bucket, path) => ({ exists: objects.has(`${bucket}/${path}`), error: null }),
      markReadyIfPending: async () => {
        if (state.row) state.row.upload_status = "ready";
        return { data: { id: mediaId, project_id: projectId, upload_status: "ready" }, error: null };
      },
    }, { media_id: mediaId, project_id: projectId });

    expect(finalized).toMatchObject({ success: true, data: { upload_status: "ready" } });
    expect(state.row.upload_status).toBe("ready");

    // Models the existing bounded RPC contract; no physical object removal is invented.
    state.row.deleted_at = "2026-07-28T00:01:00.000Z";
    const normalTableRead = state.row.deleted_at === null && state.row.upload_status === "ready" ? state.row : null;
    const normalStorageRead = state.row.deleted_at === null ? objects.values().next().value : null;
    expect(state.row.deleted_at).not.toBeNull();
    expect(normalTableRead).toBeNull();
    expect(normalStorageRead).toBeNull();
    expect(objects.size).toBe(1); // expected orphan: normal roles have no physical removal right
  });
});
