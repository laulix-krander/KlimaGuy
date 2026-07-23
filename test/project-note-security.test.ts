import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607220001_project_notes_soft_delete_rls.sql";
const rpcMigrationPath = "supabase/migrations/202607230001_project_note_soft_delete_rpc.sql";
const migration = readFileSync(migrationPath, "utf8");
const rpcMigration = readFileSync(rpcMigrationPath, "utf8");
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


describe("AP-10-HF-02 project note soft-delete RPC migration", () => {
  it("creates the bounded SECURITY DEFINER RPC with fixed search_path and boolean return", () => {
    expect(rpcMigration).toContain("create or replace function public.soft_delete_project_note(");
    expect(rpcMigration).toContain("target_note_id uuid");
    expect(rpcMigration).toContain("target_project_id uuid");
    expect(rpcMigration).toContain("returns boolean");
    expect(rpcMigration).toMatch(/security\s+definer/i);
    expect(rpcMigration).toMatch(/set\s+search_path\s+=\s+public,\s*pg_temp/i);
  });

  it("checks authenticated user, app role, active project and active note ownership inside the function", () => {
    expect(rpcMigration).toContain("actor_id uuid := auth.uid()");
    expect(rpcMigration).toContain("actor_role text := public.current_app_role()");
    expect(rpcMigration).toMatch(/actor_id\s+is\s+null[\s\S]*return\s+false/i);
    expect(rpcMigration).toMatch(/actor_role\s+not\s+in\s+\('admin',\s*'reviewer'\)/i);
    expect(rpcMigration).toMatch(/from\s+public\.projects[\s\S]*public\.projects\.id\s+=\s+target_project_id[\s\S]*public\.projects\.deleted_at\s+is\s+null/i);
    expect(rpcMigration).toMatch(/public\.project_notes\.id\s+=\s+target_note_id[\s\S]*public\.project_notes\.project_id\s+=\s+target_project_id[\s\S]*public\.project_notes\.deleted_at\s+is\s+null/i);
    expect(rpcMigration).toMatch(/actor_role\s+=\s+'admin'/i);
    expect(rpcMigration).toMatch(/actor_role\s+=\s+'reviewer'[\s\S]*public\.project_notes\.created_by\s+=\s+actor_id/i);
  });

  it("updates only deleted_at with a server timestamp and avoids hard delete, restore and content returns", () => {
    expect(rpcMigration).toMatch(/update\s+public\.project_notes\s+set\s+deleted_at\s+=\s+statement_timestamp\(\)/i);
    const setClause = rpcMigration.match(/update\s+public\.project_notes\s+set\s+([\s\S]*?)\s+where/i)?.[1] ?? "";
    expect(setClause).toBe("deleted_at = statement_timestamp()");
    expect(setClause).not.toMatch(/\b(id|project_id|content|created_by|created_at)\s*=/i);
    expect(rpcMigration).toMatch(/get\s+diagnostics\s+affected_rows\s+=\s+row_count/i);
    expect(rpcMigration).toMatch(/return\s+affected_rows\s+=\s+1/i);
    expect(rpcMigration).not.toMatch(/\bdelete\s+from\b/i);
    expect(rpcMigration).not.toMatch(/deleted_at\s+=\s+null/i);
    expect(rpcMigration).not.toMatch(/returns\s+table/i);
    expect(rpcMigration).not.toMatch(/\bcontent\b/i);
  });

  it("grants execution only to authenticated users and not PUBLIC", () => {
    expect(rpcMigration).toMatch(/revoke\s+all\s+on\s+function\s+public\.soft_delete_project_note\(uuid,\s*uuid\)\s+from\s+public/i);
    expect(rpcMigration).toMatch(/grant\s+execute\s+on\s+function\s+public\.soft_delete_project_note\(uuid,\s*uuid\)\s+to\s+authenticated/i);
    expect(rpcMigration).not.toMatch(/grant\s+execute[\s\S]*\bto\s+anon\b/i);
  });

  it("does not relax the normal active-note SELECT policy", () => {
    expect(migration).toMatch(/create policy "project notes read active"[\s\S]*for select[\s\S]*deleted_at is null/i);
    expect(rpcMigration).not.toMatch(/create\s+policy[\s\S]*for\s+select/i);
    expect(rpcMigration).not.toMatch(/alter\s+policy[\s\S]*project notes read active/i);
  });
});
