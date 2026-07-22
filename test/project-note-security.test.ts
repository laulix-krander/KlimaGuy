import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607220001_project_notes_soft_delete_rls.sql";
const migration = readFileSync(migrationPath, "utf8");
const projectPage = readFileSync("app/(app)/projects/[id]/page.tsx", "utf8");
const createService = readFileSync("lib/actions/project-note-create-service.ts", "utf8");

describe("AP-09 project notes migration", () => {
  it("adds deleted_at without deleting or truncating existing notes", () => {
    expect(migration).toContain("add column deleted_at timestamptz null");
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+project_notes\b/i);
  });

  it("keeps existing project note columns and creates one active-note index", () => {
    expect(migration).not.toMatch(/drop\s+column\s+(id|project_id|content|created_by|created_at|updated_at)/i);
    expect(migration).toContain("create index project_notes_active_project_created_idx");
    expect(migration).toContain("on project_notes(project_id, created_at desc)");
    expect(migration).toContain("where deleted_at is null");
  });

  it("does not duplicate the existing updated_at trigger or create another updated_at function", () => {
    expect(migration).not.toContain("project_notes_updated");
    expect(migration).not.toContain("function set_updated_at");
    expect((migration.match(/create trigger/gi) ?? [])).toHaveLength(1);
    expect(migration).toContain("project_notes_protected_fields_guard");
  });

  it("replaces broad legacy policies with explicit AP-09 policies and no delete policy", () => {
    expect(migration).toContain('drop policy if exists "notes read"');
    expect(migration).toContain('drop policy if exists "notes insert"');
    expect(migration).toContain('drop policy if exists "notes update"');
    expect(migration).toContain('create policy "project notes read active"');
    expect(migration).toContain('create policy "project notes insert active"');
    expect(migration).toContain('create policy "project notes update active admin"');
    expect(migration).toContain('create policy "project notes update own active reviewer"');
    expect(migration).not.toMatch(/for\s+delete/i);
  });

  it("requires active notes and accessible active projects for reads and inserts", () => {
    expect(migration).toMatch(/for select[\s\S]*auth\.uid\(\) is not null[\s\S]*current_app_role\(\) in \('admin', 'reviewer'\)[\s\S]*deleted_at is null[\s\S]*projects\.deleted_at is null/i);
    expect(migration).toMatch(/for insert[\s\S]*created_by = auth\.uid\(\)[\s\S]*deleted_at is null[\s\S]*projects\.deleted_at is null/i);
  });

  it("allows admin active-note updates and reviewer own active-note updates", () => {
    expect(migration).toMatch(/project notes update active admin[\s\S]*current_app_role\(\) = 'admin'[\s\S]*deleted_at is null/i);
    expect(migration).toMatch(/project notes update own active reviewer[\s\S]*current_app_role\(\) = 'reviewer'[\s\S]*created_by = auth\.uid\(\)[\s\S]*deleted_at is null/i);
  });

  it("protects immutable fields and blocks restore of soft-deleted notes", () => {
    expect(migration).toContain("prevent_project_note_protected_field_updates");
    expect(migration).toContain("new.id is distinct from old.id");
    expect(migration).toContain("new.project_id is distinct from old.project_id");
    expect(migration).toContain("new.created_by is distinct from old.created_by");
    expect(migration).toContain("new.created_at is distinct from old.created_at");
    expect(migration).toContain("old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at");
  });
});

describe("AP-09 application compatibility", () => {
  it("filters the AP-08 note list to active project notes in newest-first order", () => {
    expect(projectPage).toContain('.from("project_notes")');
    expect(projectPage).toContain('.eq("project_id", project.id)');
    expect(projectPage).toContain('.is("deleted_at", null)');
    expect(projectPage).toContain('.order("created_at", { ascending: false })');
  });

  it("keeps the AP-08 insert payload unchanged and without deleted_at", () => {
    expect(createService).toContain("export type ProjectNoteInsert = { project_id: string; content: string; created_by: string }");
    expect(createService).toContain("project_id: parsedInput.data.project_id");
    expect(createService).toContain("content: parsedInput.data.content");
    expect(createService).toContain("created_by: user.id");
    expect(createService).not.toMatch(/deleted_at:\s*/);
  });
});
