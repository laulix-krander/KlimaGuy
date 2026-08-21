import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canBindProjectMediaAsEvidence } from "@/lib/domain/permissions";
import { bindProjectMediaEvidenceInputSchema, projectEvidenceDtoSchema, toConversationEvidenceAsset } from "@/lib/domain/conversation-intelligence/project-evidence";
import { bindProjectMediaAsEvidenceWithDataSource, type ProjectEvidenceBindingDataSource, type ProjectEvidenceRow } from "@/lib/actions/project-evidence-binding-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const input = { project_id: projectId, project_media_id: mediaId, evidence_target: "room_overview", purpose: "evaluate_room_dimension_context" };
const row: ProjectEvidenceRow = { id: evidenceId, project_id: projectId, project_media_id: mediaId, evidence_target: "room_overview", purpose: "evaluate_room_dimension_context", source_channel: "internal_upload", source_actor_class: "admin", binding_status: "bound", created_at: "2026-08-21T12:00:00.000Z" };

function setup(options: { user?: boolean; role?: string | null; project?: boolean; media?: boolean; mediaProject?: string; status?: string; mediaType?: string; deleted?: boolean; existing?: boolean; insertError?: boolean; replay?: boolean } = {}) {
  const calls = { insert: 0, payload: undefined as Omit<ProjectEvidenceRow, "created_at"> | undefined, find: 0 };
  const source: ProjectEvidenceBindingDataSource = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId } } }) },
    getProfile: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }),
    getActiveProject: async () => ({ data: options.project === false ? null : { id: projectId }, error: null }),
    getProjectMedia: async () => ({ data: options.media === false ? null : { id: mediaId, project_id: options.mediaProject ?? projectId, upload_status: options.status ?? "ready", media_type: options.mediaType ?? "image", deleted_at: options.deleted ? "2026-08-21T00:00:00.000Z" : null }, error: null }),
    findSemanticBinding: async () => { calls.find += 1; return { data: options.existing || (options.replay && calls.find > 1) ? row : null, error: null }; },
    insertEvidence: async (payload) => { calls.insert += 1; calls.payload = payload; return { data: options.insertError ? null : { ...row, ...payload }, error: options.insertError ? { code: "db" } : null }; },
  };
  return { source, calls };
}

describe("Project-Evidence-Contract", () => {
  it("akzeptiert ausschließlich IDs sowie kompatible geschlossene Target-/Purpose-Codes", () => {
    expect(bindProjectMediaEvidenceInputSchema.parse(input)).toEqual(input);
    expect(bindProjectMediaEvidenceInputSchema.safeParse({ ...input, purpose: "evaluate_electrical_context" }).success).toBe(false);
    expect(bindProjectMediaEvidenceInputSchema.safeParse({ ...input, evidence_target: "free" }).success).toBe(false);
    for (const extra of ["actor", "status", "source_channel", "storage_path", "signed_url", "url", "evidence_id"]) {
      expect(bindProjectMediaEvidenceInputSchema.safeParse({ ...input, [extra]: "injected" }).success).toBe(false);
    }
  });
  it("liefert ein exaktes locator- und PII-freies DTO und einen opaque Intelligence-Adapter", () => {
    const dto = projectEvidenceDtoSchema.parse({ evidence_id: row.id, project_id: row.project_id, project_media_id: row.project_media_id, target: row.evidence_target, purpose: row.purpose, source_channel: row.source_channel, source_actor_class: row.source_actor_class, binding_status: row.binding_status, created_at: row.created_at });
    expect(Object.keys(dto).sort()).toEqual(["binding_status", "created_at", "evidence_id", "project_id", "project_media_id", "purpose", "source_actor_class", "source_channel", "target"].sort());
    expect(toConversationEvidenceAsset(dto)).toEqual({ evidence_id: evidenceId, target_key: "room_overview", purpose: "evaluate_room_dimension_context", availability: "available_unanalysed" });
    expect(toConversationEvidenceAsset(dto)).not.toHaveProperty("project_media_id");
  });
});

describe("Project-Evidence-Berechtigung und Service", () => {
  it("erlaubt nur Admins und verweigert null/ungültige Rollen", async () => {
    expect(canBindProjectMediaAsEvidence("admin")).toBe(true); expect(canBindProjectMediaAsEvidence("reviewer")).toBe(false); expect(canBindProjectMediaAsEvidence(null)).toBe(false);
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ user: false }).source, input)).resolves.toMatchObject({ success: false, code: "unauthenticated" });
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ role: null }).source, input)).resolves.toMatchObject({ success: false, code: "invalid_profile" });
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ role: "reviewer" }).source, input)).resolves.toMatchObject({ success: false, code: "forbidden" });
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ role: "invalid" }).source, input)).resolves.toMatchObject({ success: false, code: "invalid_profile" });
  });
  it("bindet ein aktives ready-Bild mit ausschließlich serverbestimmter Provenienz", async () => {
    const mock = setup(); const result = await bindProjectMediaAsEvidenceWithDataSource(mock.source, input, () => evidenceId);
    expect(result).toEqual({ success: true, result: "bound", data: { evidence_id: evidenceId, project_id: projectId, project_media_id: mediaId, target: "room_overview", purpose: "evaluate_room_dimension_context", source_channel: "internal_upload", source_actor_class: "admin", binding_status: "bound", created_at: row.created_at } });
    expect(mock.calls.payload).toEqual({ id: evidenceId, project_id: projectId, project_media_id: mediaId, evidence_target: "room_overview", purpose: "evaluate_room_dimension_context", source_channel: "internal_upload", source_actor_class: "admin", binding_status: "bound" });
  });
  it("weist fehlende Projekte, Medien und Cross-Project-Bindings neutral und ohne Insert ab", async () => {
    for (const [options, code] of [[{ project: false }, "project_not_found"], [{ media: false }, "media_not_found"], [{ mediaProject: otherProjectId }, "project_mismatch"]] as const) {
      const mock = setup(options); await expect(bindProjectMediaAsEvidenceWithDataSource(mock.source, input)).resolves.toMatchObject({ success: false, code }); expect(mock.calls.insert).toBe(0);
    }
  });
  it("weist pending, failed, gelöschte und Dokument-Medien ab", async () => {
    for (const options of [{ status: "pending" }, { status: "failed" }, { deleted: true }, { mediaType: "document" }]) await expect(bindProjectMediaAsEvidenceWithDataSource(setup(options).source, input)).resolves.toMatchObject({ success: false, code: "media_not_eligible" });
  });
  it("ist vor und nach einem konkurrierenden Unique-Konflikt idempotent", async () => {
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ existing: true }).source, input)).resolves.toMatchObject({ success: true, result: "already_bound", data: { evidence_id: evidenceId } });
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ insertError: true, replay: true }).source, input)).resolves.toMatchObject({ success: true, result: "already_bound", data: { evidence_id: evidenceId } });
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup({ insertError: true }).source, input)).resolves.toMatchObject({ success: false, code: "persistence_failed" });
  });
  it("erlaubt eine andere gültige Target-/Purpose-Bindung als eigene Evidence Identity", async () => {
    const alternate = { ...input, evidence_target: "indoor_area_overview", purpose: "evaluate_indoor_position_context" };
    await expect(bindProjectMediaAsEvidenceWithDataSource(setup().source, alternate, () => evidenceId)).resolves.toMatchObject({ success: true, result: "bound", data: { target: "indoor_area_overview" } });
  });
});

describe("Migration und Architektur", () => {
  const sql = readFileSync("supabase/migrations/202608210001_project_evidence_persistence.sql", "utf8");
  const action = readFileSync("lib/actions/project-evidence-binding.ts", "utf8");
  const productionPath = `${action}\n${readFileSync("lib/actions/project-evidence-binding-service.ts", "utf8")}\n${readFileSync("lib/domain/conversation-intelligence/project-evidence.ts", "utf8")}`;
  it("definiert PK, eigene UUID, composite Project-Integrität, RESTRICT und semantische Unique-Bindung", () => {
    expect(sql).toMatch(/id uuid not null default gen_random_uuid\(\)/); expect(sql).toMatch(/primary key \(id\)/);
    expect(sql).toMatch(/foreign key \(project_id, project_media_id\)[\s\S]*?project_media\(project_id, id\) on delete restrict/);
    expect(sql).toContain("unique (project_id, project_media_id, evidence_target, purpose)");
  });
  it("erzwingt Checks, Indizes, RLS, fail-closed Policies und explizite Grants", () => {
    for (const token of ["project_evidence_target_check", "project_evidence_purpose_check", "project_evidence_source_channel_check", "project_evidence_binding_status_check", "project_evidence_project_idx", "project_evidence_media_idx", "project_evidence_target_idx", "enable row level security", "project evidence select active admin", "project evidence insert active admin", "grant select, insert"]) expect(sql).toContain(token);
    expect(sql).toContain("revoke all privileges on table public.project_evidence from public, anon, authenticated"); expect(sql).not.toMatch(/grant all|to anon/);
  });
  it("enthält keine Locatorfelder und der neue Produktionspfad keine verbotenen Integrationen", () => {
    const columns = sql.slice(sql.indexOf("create table"), sql.indexOf(");", sql.indexOf("create table")));
    expect(columns).not.toMatch(/storage_path|storage_bucket|signed_url|upload_token|provider/);
    expect(productionPath).not.toMatch(/SUPABASE_SERVICE_ROLE|service_role|createSignedUrls?|storage\.from|\.remove\(|\.upload\(|openai|anthropic|whatsapp|graph\.facebook|fetch\(/i);
  });
  it("mutiert weder Observation, Claim, Knowledge State, Readiness noch Missing Information", () => {
    expect(productionPath).not.toMatch(/EvidenceObservation|ClaimProposal|KnowledgeState|Readiness|MissingInformation|applyClaim/);
  });
});
