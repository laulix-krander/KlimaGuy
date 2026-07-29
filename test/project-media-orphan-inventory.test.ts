import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canViewProjectMediaOrphanInventory } from "@/lib/domain/permissions";
import {
  getProjectMediaOrphanInventoryWithDataSource,
  PROJECT_MEDIA_ORPHAN_INVENTORY_PAGE_SIZE,
  type ProjectMediaOrphanInventoryDataSource,
  type ProjectMediaOrphanInventoryRow,
} from "@/lib/actions/project-media-orphan-inventory-service";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-29T12:00:00.000Z");

const row = (overrides: Partial<ProjectMediaOrphanInventoryRow> = {}): ProjectMediaOrphanInventoryRow => ({
  media_id: mediaId,
  project_id: projectId,
  project_title: "Projekt Nord",
  upload_status: "pending",
  created_at: "2026-07-28T11:00:00.000Z",
  age_hours: 25,
  mime_type: "image/jpeg",
  file_size_bytes: 1234,
  total_count: 1,
  ...overrides,
});

function source(options: { user?: boolean; profile?: boolean; role?: string; rows?: ProjectMediaOrphanInventoryRow[]; error?: unknown } = {}) {
  const calls: Array<{ filter: string; page: number }> = [];
  const dataSource: ProjectMediaOrphanInventoryDataSource = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId } } }) },
    getProfile: async () => ({ data: options.profile === false ? null : { role: options.role ?? "admin" }, error: null }),
    listCandidates: async (filter, page) => {
      calls.push({ filter, page });
      return { data: options.error ? null : options.rows ?? [row()], error: options.error ?? null };
    },
  };
  return { dataSource, calls };
}

describe("Orphan-Inventurberechtigung", () => {
  it("erlaubt zentral ausschließlich Admins", () => {
    expect(canViewProjectMediaOrphanInventory("admin")).toBe(true);
    expect(canViewProjectMediaOrphanInventory("reviewer")).toBe(false);
  });
  it.each([
    [{ user: false }, "not_authenticated"],
    [{ profile: false }, "profile_unavailable"],
    [{ role: "invalid" }, "profile_unavailable"],
    [{ role: "reviewer" }, "not_authorized"],
  ] as const)("verweigert Auth-/Profil-/Rollenfall %#", async (options, code) => {
    const mock = source(options);
    await expect(getProjectMediaOrphanInventoryWithDataSource(mock.dataSource, {}, now)).resolves.toMatchObject({ success: false, code });
    expect(mock.calls).toHaveLength(0);
  });
});

describe("Orphan-Inventurservice", () => {
  it("übergibt nur festen Statusfilter und validierte Pagination", async () => {
    const mock = source();
    const result = await getProjectMediaOrphanInventoryWithDataSource(mock.dataSource, { status: "failed", page: "2" }, now);
    expect(result).toMatchObject({ success: true, data: { filter: "failed", page: 2, page_size: PROJECT_MEDIA_ORPHAN_INVENTORY_PAGE_SIZE } });
    expect(mock.calls).toEqual([{ filter: "failed", page: 2 }]);
  });
  it.each([{ page: "0", status: "all" }, { page: "x", status: "all" }])("weist ungültige Seiten ab", async (input) => {
    await expect(getProjectMediaOrphanInventoryWithDataSource(source().dataSource, input, now)).resolves.toMatchObject({ success: false, code: "invalid_page" });
  });
  it("weist freie Filter ab", async () => {
    await expect(getProjectMediaOrphanInventoryWithDataSource(source().dataSource, { page: 1, status: "%" }, now)).resolves.toMatchObject({ success: false, code: "invalid_filter" });
  });
  it("klassifiziert ausschließlich alte pending/failed-Zeilen", async () => {
    for (const upload_status of ["pending", "failed"] as const) {
      const result = await getProjectMediaOrphanInventoryWithDataSource(source({ rows: [row({ upload_status })] }).dataSource, {}, now);
      expect(result).toMatchObject({ success: true, data: { items: [{ classification: `${upload_status}_orphan_candidate`, diagnostic_code: `${upload_status}_orphan_candidate` }] } });
    }
    for (const invalid of [row({ upload_status: "ready" }), row({ created_at: "2026-07-29T11:00:00.000Z", age_hours: 1 })]) {
      await expect(getProjectMediaOrphanInventoryWithDataSource(source({ rows: [invalid] }).dataSource, {}, now)).resolves.toMatchObject({ success: false, code: "load_failed" });
    }
  });
  it("liefert ausschließlich das schmale DTO ohne Pfade, Dateinamen, URLs, Tokens oder Kundendaten", async () => {
    const result = await getProjectMediaOrphanInventoryWithDataSource(source().dataSource, {}, now);
    if (!result.success) throw new Error("expected success");
    expect(Object.keys(result.data.items[0]).sort()).toEqual([
      "age_hours", "classification", "created_at", "diagnostic_code", "file_size_bytes", "media_id",
      "mime_type", "project_id", "project_title", "upload_status",
    ].sort());
    expect(JSON.stringify(result)).not.toMatch(/original_filename|storage_path|token|url|customer|address/i);
  });
});

describe("Orphan-Inventurarchitektur", () => {
  const adapter = readFileSync("lib/actions/project-media-orphan-inventory.ts", "utf8");
  const service = readFileSync("lib/actions/project-media-orphan-inventory-service.ts", "utf8");
  it("verwendet nur die enge Inventur-RPC und keine Storage- oder Mutationspfade", () => {
    expect(adapter).toContain('rpc("list_project_media_orphan_candidates"');
    expect(`${adapter}\n${service}`).not.toMatch(/\.storage\b|createSignedUrl|getPublicUrl|service_role|SUPABASE_SERVICE_ROLE|\.update\(|\.delete\(|\.remove\(/);
  });
});
