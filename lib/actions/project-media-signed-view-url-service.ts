import { canViewProjectMedia } from "@/lib/domain/permissions";
import {
  createProjectMediaSignedViewUrlSchema,
  PROJECT_MEDIA_MIME_TYPES,
  roleSchema,
} from "@/lib/domain/schemas";
import { z } from "zod";

export const PROJECT_MEDIA_SIGNED_VIEW_URL_TTL_SECONDS = 120 as const;
const PROJECT_MEDIA_BUCKET = "project-media" as const;

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

const readyProjectMediaRowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  storage_bucket: z.literal(PROJECT_MEDIA_BUCKET),
  storage_path: z.string().min(1),
  mime_type: z.enum(PROJECT_MEDIA_MIME_TYPES),
  media_type: z.enum(["image", "document"]),
  upload_status: z.literal("ready"),
  deleted_at: z.null(),
}).strict().superRefine((row, context) => {
  const expectedMediaType = row.mime_type === "application/pdf" ? "document" : "image";
  if (row.media_type !== expectedMediaType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["media_type"], message: "Ungültige Medienart." });
  }

  const storedFileId = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const canonicalPath = new RegExp(
    `^projects/${row.project_id}/originals/${row.id}/${storedFileId}\\.${extensionByMimeType[row.mime_type]}$`,
  );
  if (!canonicalPath.test(row.storage_path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storage_path"], message: "Ungültiger Speicherpfad." });
  }
});

export type ReadyProjectMediaForSignedViewUrl = {
  id: string;
  project_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  media_type: string;
  upload_status: string;
  deleted_at: string | null;
};

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

export type ProjectMediaSignedViewUrlDataSource = {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string; deleted_at: null }>;
  getReadyProjectMedia(mediaId: string, projectId: string): QueryResult<ReadyProjectMediaForSignedViewUrl>;
  createSignedUrl(bucket: string, path: string, expiresIn: number): QueryResult<{ signedUrl: string }>;
};

export type ProjectMediaSignedViewUrlErrorCode =
  | "signed_url_forbidden"
  | "signed_url_not_found"
  | "signed_url_not_available"
  | "signed_url_invalid_input"
  | "signed_url_failed";

export type ProjectMediaSignedViewUrlResult =
  | { success: true; media_id: string; signed_view_url: string; expires_in_seconds: 120 }
  | { success: false; code: ProjectMediaSignedViewUrlErrorCode; error: string };

const errorMessages: Record<ProjectMediaSignedViewUrlErrorCode, string> = {
  signed_url_forbidden: "Der Zugriff ist nicht erlaubt.",
  signed_url_not_found: "Das Medium ist nicht mehr verfügbar.",
  signed_url_not_available: "Das Medium konnte nicht geöffnet werden.",
  signed_url_invalid_input: "Die Vorschau konnte nicht erneuert werden.",
  signed_url_failed: "Die Vorschau konnte nicht erneuert werden.",
};

function failure(code: ProjectMediaSignedViewUrlErrorCode): Extract<ProjectMediaSignedViewUrlResult, { success: false }> {
  return { success: false, code, error: errorMessages[code] };
}

export async function createProjectMediaSignedViewUrlWithDataSource(
  dataSource: ProjectMediaSignedViewUrlDataSource,
  input: unknown,
): Promise<ProjectMediaSignedViewUrlResult> {
  const parsedInput = createProjectMediaSignedViewUrlSchema.safeParse(input);
  if (!parsedInput.success) return failure("signed_url_invalid_input");

  const { data: authData, error: authError } = await dataSource.getUser();
  if (authError || !authData.user) return failure("signed_url_forbidden");

  const { data: profile, error: profileError } = await dataSource.getProfile(authData.user.id);
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (profileError || !profile || !parsedRole.success || !canViewProjectMedia(parsedRole.data)) {
    return failure("signed_url_forbidden");
  }

  const { project_id: projectId, media_id: mediaId } = parsedInput.data;
  const { data: project, error: projectError } = await dataSource.getActiveProject(projectId);
  if (projectError || !project || project.id !== projectId || project.deleted_at !== null) {
    return failure("signed_url_not_found");
  }

  const { data: media, error: mediaError } = await dataSource.getReadyProjectMedia(mediaId, projectId);
  if (mediaError || !media) return failure("signed_url_not_found");
  const parsedMedia = readyProjectMediaRowSchema.safeParse(media);
  if (!parsedMedia.success || parsedMedia.data.id !== mediaId || parsedMedia.data.project_id !== projectId) {
    return failure("signed_url_not_available");
  }

  const { data: signedUrl, error: signedUrlError } = await dataSource.createSignedUrl(
    parsedMedia.data.storage_bucket,
    parsedMedia.data.storage_path,
    PROJECT_MEDIA_SIGNED_VIEW_URL_TTL_SECONDS,
  );
  if (signedUrlError || !signedUrl || typeof signedUrl.signedUrl !== "string" || signedUrl.signedUrl.length === 0) {
    return failure("signed_url_failed");
  }

  return {
    success: true,
    media_id: mediaId,
    signed_view_url: signedUrl.signedUrl,
    expires_in_seconds: PROJECT_MEDIA_SIGNED_VIEW_URL_TTL_SECONDS,
  };
}
