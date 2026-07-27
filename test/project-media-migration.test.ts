import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607270001_project_media_table_baseline.sql";
const migration = readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ");

const expectedColumns = [
  "id", "project_id", "storage_bucket", "storage_path", "original_filename",
  "stored_filename", "mime_type", "file_size_bytes", "media_type", "category",
  "source", "upload_status", "uploaded_by", "created_at", "updated_at", "deleted_at", "caption",
];

describe("AP-12-01-01 project_media migration", () => {
  it("creates exactly the approved MVP columns", () => {
    const body = migration.match(/create table public\.project_media \(([\s\S]*?)\n\);/)?.[1] ?? "";
    const columns = body
      .split("\n")
      .map((line) => line.match(/^  ([a-z_]+) (?:uuid|text|bigint|timestamptz)\b/)?.[1])
      .filter((column): column is string => Boolean(column));
    expect(columns).toEqual(expectedColumns);
    expect(body).not.toMatch(/\b(customer_id|sort_order|processing_status|width|height|page_count|checksum|metadata|tenant_id)\b/);
  });

  it("defines the approved defaults and no defaults for input or nullable fields", () => {
    expect(normalized).toContain("id uuid not null default gen_random_uuid()");
    expect(normalized).toContain("storage_bucket text not null default 'project-media'");
    expect(normalized).toContain("category text not null default 'other'");
    expect(normalized).toContain("source text not null default 'manual_upload'");
    expect(normalized).toContain("upload_status text not null default 'pending'");
    expect(normalized).toContain("created_at timestamptz not null default now()");
    expect(normalized).toContain("updated_at timestamptz not null default now()");
    for (const column of ["project_id", "storage_path", "original_filename", "stored_filename", "mime_type", "file_size_bytes", "media_type", "uploaded_by", "deleted_at", "caption"]) {
      expect(normalized).not.toMatch(new RegExp(`${column} (?:uuid|text|bigint|timestamptz)(?: not null| null)? default`, "i"));
    }
  });

  it("uses named primary, restrictive foreign-key and unique constraints", () => {
    expect(normalized).toContain("constraint project_media_pkey primary key (id)");
    expect(normalized).toContain("constraint project_media_project_id_fkey foreign key (project_id) references public.projects(id) on delete restrict");
    expect(normalized).toContain("constraint project_media_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id) on delete restrict");
    expect(normalized).toContain("constraint project_media_storage_bucket_path_key unique (storage_bucket, storage_path)");
    expect(migration).not.toMatch(/on delete (cascade|set null)/i);
  });

  it("closes all controlled-value allowlists", () => {
    expect(normalized).toContain("constraint project_media_storage_bucket_check check (storage_bucket = 'project-media')");
    expect(normalized).toContain("constraint project_media_source_check check (source = 'manual_upload')");
    expect(normalized).toContain("constraint project_media_upload_status_check check (upload_status in ('pending', 'ready', 'failed'))");
    expect(normalized).toContain("constraint project_media_media_type_check check (media_type in ('image', 'document'))");
    expect(normalized).toContain("constraint project_media_mime_type_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))");
    for (const category of ["indoor_area", "outdoor_area", "indoor_unit_location", "outdoor_unit_location", "pipe_route", "electrical_connection", "condensate_route", "facade", "roof", "balcony", "floor_plan", "technical_document", "customer_document", "other"]) {
      expect(normalized).toMatch(new RegExp(`project_media_category_check[^;]*'${category}'`));
    }
  });

  it("enforces MIME/media consistency and decimal byte limits", () => {
    expect(normalized).toMatch(/project_media_mime_media_type_check.*image\/jpeg.*media_type = 'image'.*application\/pdf.*media_type = 'document'/);
    expect(normalized).toContain("constraint project_media_file_size_positive_check check (file_size_bytes > 0)");
    expect(normalized).toMatch(/project_media_file_size_limit_check.*image\/jpeg.*file_size_bytes <= 15000000.*application\/pdf.*file_size_bytes <= 25000000/);
    expect(migration).not.toMatch(/1024\s*\*/);
  });

  it("constrains display and stored filenames, canonical extensions and caption", () => {
    expect(normalized).toMatch(/project_media_original_filename_check.*char_length\(original_filename\) between 1 and 255.*original_filename not in \('\.', '\.\.'\)/);
    expect(normalized).toContain("position('/' in original_filename) = 0");
    expect(normalized).toContain("position(E'\\\\' in original_filename) = 0");
    expect(normalized).toContain("original_filename !~ '[[:cntrl:]]'");
    expect(normalized).toMatch(/project_media_stored_filename_check.*\[0-9a-f\].*\\\.\(jpg\|png\|webp\|pdf\)/);
    expect(normalized).toMatch(/project_media_mime_extension_check.*image\/jpeg.*\\\.jpg\$.*application\/pdf.*\\\.pdf\$/);
    expect(normalized).toContain("constraint project_media_caption_check check (caption is null or char_length(caption) <= 1000)");
  });

  it("binds the storage path to project, media id and stored filename", () => {
    const pathCheck = normalized.match(/constraint project_media_storage_path_check check \((.*?)\)/)?.[1] ?? "";
    expect(pathCheck).toBe(" storage_path = 'projects/' || project_id::text || '/originals/' || id::text || '/' || stored_filename ");
    expect(pathCheck).not.toMatch(/customer_id|original_filename/);
  });

  it("reuses updated_at and protects immutable fields and status transitions", () => {
    expect(migration).toContain("execute function public.set_updated_at()");
    expect(migration).toContain("prevent_project_media_protected_field_updates");
    for (const field of ["id", "project_id", "storage_bucket", "storage_path", "original_filename", "stored_filename", "mime_type", "file_size_bytes", "media_type", "source", "uploaded_by", "created_at", "deleted_at"]) {
      expect(migration).toContain(`new.${field} is distinct from old.${field}`);
    }
    expect(normalized).toMatch(/old.upload_status = 'pending' and new.upload_status in \('ready', 'failed'\)/);
  });

  it("creates only the partial active-project listing index", () => {
    const indexes = migration.match(/create index /gi) ?? [];
    expect(indexes).toHaveLength(1);
    expect(normalized).toContain("create index project_media_active_project_created_idx on public.project_media(project_id, created_at desc, id) where deleted_at is null");
  });

  it("is deny-by-default without application or Storage policies", () => {
    expect(normalized).toContain("alter table public.project_media enable row level security");
    expect(normalized).toContain("revoke all on table public.project_media from anon, authenticated");
    expect(migration).not.toMatch(/\bcreate\s+policy\b/i);
    expect(migration).not.toMatch(/\bgrant\b/i);
    expect(migration).not.toMatch(/storage\.(buckets|objects)/i);
    expect(migration).not.toMatch(/\b(drop|truncate|delete from)\b/i);
  });
});
