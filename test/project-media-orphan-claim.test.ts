import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canClaimProjectMediaOrphan } from "@/lib/domain/permissions";
import {
  claimProjectMediaOrphanWithDataSource,
  type ProjectMediaOrphanClaimDataSource,
} from "@/lib/actions/project-media-orphan-claim-service";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const input = { media_id: mediaId, project_id: projectId };

function source(options: { user?: boolean; profile?: boolean; role?: string; rows?: unknown[]; error?: { code?: string } } = {}) {
  const calls: unknown[][] = [];
  const dataSource: ProjectMediaOrphanClaimDataSource = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId } } }) },
    getProfile: async () => ({ data: options.profile === false ? null : { role: options.role ?? "admin" }, error: null }),
    claim: async (...args) => {
      calls.push(args);
      return {
        data: (options.rows ?? [{ cleanup_item_id: crypto.randomUUID(), media_id: mediaId, project_id: projectId, cleanup_status: "soft_deleted" }]) as never,
        error: options.error ?? null,
      };
    },
  };
  return { dataSource, calls };
}

describe("Orphan-Claim-Service", () => {
  it("erlaubt die zentrale Permission ausschließlich Admins", () => {
    expect(canClaimProjectMediaOrphan("admin")).toBe(true);
    expect(canClaimProjectMediaOrphan("reviewer")).toBe(false);
  });

  it.each([
    [{ user: false }, "cleanup_forbidden"],
    [{ profile: false }, "cleanup_forbidden"],
    [{ role: "reviewer" }, "cleanup_forbidden"],
    [{ role: "invalid" }, "cleanup_forbidden"],
  ] as const)("verweigert Auth-, Profil- und Rollenfall %#", async (options, code) => {
    const mock = source(options);
    await expect(claimProjectMediaOrphanWithDataSource(mock.dataSource, input)).resolves.toMatchObject({ success: false, code });
    expect(mock.calls).toHaveLength(0);
  });

  it("weist ungültige und zusätzliche Eingabefelder strikt vor der RPC ab", async () => {
    for (const value of [{ ...input, cleanup_status: "soft_deleted" }, { media_id: "x", project_id: projectId }]) {
      const mock = source();
      await expect(claimProjectMediaOrphanWithDataSource(mock.dataSource, value)).resolves.toEqual({ success: false, code: "cleanup_not_eligible" });
      expect(mock.calls).toHaveLength(0);
    }
  });

  it("übergibt nur die beiden IDs an die RPC und validiert die schmale Erfolgsantwort", async () => {
    const mock = source();
    await expect(claimProjectMediaOrphanWithDataSource(mock.dataSource, input)).resolves.toEqual({ success: true, code: "cleanup_soft_deleted" });
    expect(mock.calls).toEqual([[mediaId, projectId]]);
  });

  it("mappt Nicht-Eignung, Konflikt, Datenbankfehler und unerwartete Antworten ohne Rohfehler", async () => {
    await expect(claimProjectMediaOrphanWithDataSource(source({ rows: [] }).dataSource, input)).resolves.toEqual({ success: false, code: "cleanup_not_eligible" });
    await expect(claimProjectMediaOrphanWithDataSource(source({ error: { code: "23505" } }).dataSource, input)).resolves.toEqual({ success: false, code: "cleanup_conflict" });
    await expect(claimProjectMediaOrphanWithDataSource(source({ error: { code: "XX000" } }).dataSource, input)).resolves.toEqual({ success: false, code: "cleanup_failed" });
    await expect(claimProjectMediaOrphanWithDataSource(source({ rows: [{ media_id: mediaId, project_id: projectId, cleanup_status: "claimed" }] }).dataSource, input)).resolves.toEqual({ success: false, code: "cleanup_failed" });
  });
});

describe("Orphan-Claim-Architektur", () => {
  const adapter = readFileSync("lib/actions/project-media-orphan-claim.ts", "utf8");
  const service = readFileSync("lib/actions/project-media-orphan-claim-service.ts", "utf8");
  it("nutzt nur die Claim-RPC und revalidiert ausschließlich bei Erfolg die Inventur", () => {
    expect(adapter).toContain('rpc("claim_and_soft_delete_project_media_orphan"');
    expect(adapter).toContain('if (result.success) revalidatePath("/admin/project-media/orphans")');
    expect(`${adapter}\n${service}`).not.toMatch(/\.storage\b|service_role|SUPABASE_SERVICE_ROLE|\.from\("project_media"\)|\.update\(|\.delete\(|\.remove\(/);
  });
});
