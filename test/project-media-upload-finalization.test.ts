import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  finalizeProjectMediaUploadWithDataSource,
  type ProjectMediaForFinalization,
  type ProjectMediaUploadFinalizationDataSource,
} from "@/lib/actions/project-media-upload-finalization-service";
import { finalizeProjectMediaUploadSchema } from "@/lib/domain/schemas";

const projectId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const media: ProjectMediaForFinalization = {
  id: mediaId,
  project_id: projectId,
  storage_bucket: "project-media",
  storage_path: `projects/${projectId}/originals/${mediaId}/server.jpg`,
  mime_type: "image/jpeg",
  file_size_bytes: 100,
  uploaded_by: userId,
  upload_status: "pending",
  deleted_at: null,
};

function setup(options: {
  authenticated?: boolean;
  role?: string | null;
  project?: { id: string } | null;
  media?: ProjectMediaForFinalization | null;
  objectExists?: boolean;
  objectSize?: number;
  objectMime?: string;
  storageError?: unknown;
  updateData?: { id: string; project_id: string; upload_status: string } | null;
  updateError?: unknown;
} = {}) {
  const calls = { exists: [] as unknown[][], updates: [] as unknown[][] };
  const source: ProjectMediaUploadFinalizationDataSource = {
    auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : { id: userId } } }) },
    getProfile: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }),
    getActiveProject: async () => ({ data: options.project === undefined ? { id: projectId } : options.project, error: null }),
    getMedia: async () => ({ data: options.media === undefined ? media : options.media, error: null }),
    getStorageObjectMetadata: async (...args) => {
      calls.exists.push(args);
      return { data: options.objectExists === false ? null : { bucket_id: media.storage_bucket, name: media.storage_path, size: options.objectSize ?? media.file_size_bytes, mime_type: options.objectMime ?? media.mime_type }, error: options.storageError ?? null };
    },
    markReadyIfPending: async (...args) => {
      calls.updates.push(args);
      return {
        data: options.updateData === undefined ? { id: mediaId, project_id: projectId, upload_status: "ready" } : options.updateData,
        error: options.updateError ?? null,
      };
    },
  };
  return { source, calls };
}

const input = { media_id: mediaId, project_id: projectId };
async function errorCode(source: ProjectMediaUploadFinalizationDataSource, value: unknown = input) {
  const result = await finalizeProjectMediaUploadWithDataSource(source, value);
  return result.success ? "success" : result.code;
}

describe("finalizeProjectMediaUploadSchema", () => {
  it("akzeptiert nur Medien- und Projekt-ID", () => {
    expect(finalizeProjectMediaUploadSchema.safeParse(input).success).toBe(true);
    expect(finalizeProjectMediaUploadSchema.safeParse({ ...input, upload_status: "ready" }).success).toBe(false);
    expect(finalizeProjectMediaUploadSchema.safeParse({ ...input, media_id: "falsch" }).success).toBe(false);
  });
});

describe("Berechtigungen", () => {
  it.each([
    [{ authenticated: false }, "not_authenticated"],
    [{ role: null }, "profile_unavailable"],
    [{ role: "unbekannt" }, "profile_unavailable"],
    [{ role: "reviewer" }, "not_authorized"],
  ] as const)("weist ungültige Identität oder Rolle ab", async (options, expected) => {
    expect(await errorCode(setup(options).source)).toBe(expected);
  });
});

describe("Projekt, Medium und Objekt", () => {
  it("weist ein fehlendes oder gelöschtes Projekt ab", async () => {
    expect(await errorCode(setup({ project: null }).source)).toBe("project_unavailable");
  });

  it("weist ein falsches Projekt ab", async () => {
    expect(await errorCode(setup({ media: { ...media, project_id: crypto.randomUUID() } }).source)).toBe("media_missing");
  });

  it("weist fremde und gelöschte Medien ab", async () => {
    expect(await errorCode(setup({ media: { ...media, uploaded_by: crypto.randomUUID() } }).source)).toBe("media_owner_mismatch");
    expect(await errorCode(setup({ media: { ...media, deleted_at: "2026-07-27T12:00:00Z" } }).source)).toBe("media_deleted");
  });

  it("prüft das Objekt am reservierten Bucket und Pfad vor dem Update", async () => {
    const { source, calls } = setup();
    expect(await errorCode(source)).toBe("success");
    expect(calls.exists).toEqual([[mediaId, projectId]]);
    expect(calls.updates).toEqual([[mediaId, projectId, userId]]);
  });

  it("finalisiert ohne Objekt nicht", async () => {
    const { source, calls } = setup({ objectExists: false });
    expect(await errorCode(source)).toBe("storage_object_missing");
    expect(calls.updates).toHaveLength(0);
  });

  it("weist abweichende Objektmetadaten ab", async () => {
    expect(await errorCode(setup({ objectSize: 101 }).source)).toBe("storage_metadata_mismatch");
    expect(await errorCode(setup({ objectMime: "image/png" }).source)).toBe("storage_metadata_mismatch");
  });

  it("unterscheidet eine fehlgeschlagene Objektprüfung", async () => {
    expect(await errorCode(setup({ storageError: new Error("storage") }).source)).toBe("storage_check_failed");
  });
});

describe("atomare Finalisierung und Idempotenz", () => {
  it("setzt pending auf ready und gibt nur das Abschluss-DTO zurück", async () => {
    expect(await finalizeProjectMediaUploadWithDataSource(setup().source, input)).toEqual({
      success: true,
      data: { media_id: mediaId, project_id: projectId, upload_status: "ready", finalized: true },
    });
  });

  it("lässt ready unverändert und führt weder Storageprüfung noch Update aus", async () => {
    const { source, calls } = setup({ media: { ...media, upload_status: "ready" } });
    expect(await errorCode(source)).toBe("media_already_ready");
    expect(calls.exists).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });

  it("weist failed ab", async () => {
    const { source, calls } = setup({ media: { ...media, upload_status: "failed" } });
    expect(await errorCode(source)).toBe("media_failed");
    expect(calls.updates).toHaveLength(0);
  });

  it("meldet einen verlorenen Compare-and-set-Lauf als Konflikt", async () => {
    expect(await errorCode(setup({ updateData: null }).source)).toBe("finalization_conflict");
  });

  it("ändert ausschließlich upload_status und bindet das Update an Actor, Projekt, pending und Soft Delete", () => {
    const action = readFileSync("lib/actions/project-media-upload-finalization.ts", "utf8");
    expect(action).toContain('.update({ upload_status: "ready" })');
    expect(action).toContain('.eq("id", mediaId).eq("project_id", projectId).eq("uploaded_by", userId)');
    expect(action).toContain('.eq("upload_status", "pending").is("deleted_at", null)');
    expect(action.match(/\.update\(/g)).toHaveLength(1);
  });
});

describe("ausgeschlossener Scope", () => {
  it("enthält keine Signed URL, Migration, Upload, UI oder Redirect", () => {
    const files = [
      "lib/actions/project-media-upload-finalization-service.ts",
      "lib/actions/project-media-upload-finalization.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    for (const forbidden of ["createSigned" + "Url", "redirect" + "(", ".upload" + "(", "storage.objects"])
      expect(files).not.toContain(forbidden);
    expect(files).not.toContain("@/components");
  });

  it("revalidiert nach erfolgreicher Finalisierung ausschließlich das Projektdetail", () => {
    const action = readFileSync("lib/actions/project-media-upload-finalization.ts", "utf8");
    expect(action).toContain("if (result.success)");
    expect(action).toContain("getProjectMediaUploadRevalidationPaths");
    expect(action).not.toContain("getProjectOverviewRevalidationPaths");
    expect(action).not.toContain("getProjectAndCustomerRevalidationPaths");
  });
});
