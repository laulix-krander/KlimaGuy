import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyProjectFactPatch,
  getProjectFacts,
  type ProjectFactsRpc,
} from "@/lib/server/project-facts/project-facts";

const PROJECT_N = "00000000-0000-4000-8000-000000000001";
const PROJECT_N1 = "00000000-0000-4000-8000-000000000002";

function memoryPersistence(projectIds = [PROJECT_N, PROJECT_N1]): ProjectFactsRpc {
  const projects = new Set(projectIds);
  const facts = new Map<string, Map<string, unknown>>();
  return {
    async rpc(name, args) {
      const projectId = String(args.target_project_id);
      if (!projects.has(projectId)) return { data: null, error: { message: "project_not_found" } };
      const projectFacts = facts.get(projectId) ?? new Map<string, unknown>();
      facts.set(projectId, projectFacts);
      if (name === "apply_mvp_project_fact_patch") {
        for (const fact of args.fact_patch as Array<{ key: string; value: unknown }>) {
          projectFacts.set(fact.key, fact.value);
        }
      }
      return {
        data: [...projectFacts].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value })),
        error: null,
      };
    },
  };
}

describe("MVP Project facts persistence authority", () => {
  it("stores one or multiple valid facts and returns the Step-5 shape", async () => {
    const database = memoryPersistence();
    await applyProjectFactPatch(database, PROJECT_N, [{ key: "city", value: "Köln" }]);
    const facts = await applyProjectFactPatch(database, PROJECT_N, [
      { key: "building_type", value: "apartment" },
      { key: "requested_room_count", value: 2 },
    ]);
    expect(facts).toEqual([
      { key: "building_type", value: "apartment" },
      { key: "city", value: "Köln" },
      { key: "requested_room_count", value: 2 },
    ]);
    expect(await getProjectFacts(database, PROJECT_N)).toEqual(facts);
  });

  it("replaces the current value without changing another Project", async () => {
    const database = memoryPersistence();
    await applyProjectFactPatch(database, PROJECT_N, [{ key: "city", value: "Bonn" }]);
    await applyProjectFactPatch(database, PROJECT_N1, [{ key: "city", value: "Essen" }]);
    await applyProjectFactPatch(database, PROJECT_N, [{ key: "city", value: "Köln" }]);
    expect(await getProjectFacts(database, PROJECT_N)).toEqual([{ key: "city", value: "Köln" }]);
    expect(await getProjectFacts(database, PROJECT_N1)).toEqual([{ key: "city", value: "Essen" }]);
  });

  it("starts a new Project empty and rejects a missing Project", async () => {
    const database = memoryPersistence();
    await applyProjectFactPatch(database, PROJECT_N, [{ key: "postal_code", value: "50667" }]);
    expect(await getProjectFacts(database, PROJECT_N1)).toEqual([]);
    await expect(getProjectFacts(database, "00000000-0000-4000-8000-000000000099"))
      .rejects.toThrow("project_not_found");
  });

  it("rejects unknown keys, invalid values, and duplicate keys before the RPC", async () => {
    let calls = 0;
    const database: ProjectFactsRpc = { async rpc() { calls += 1; return { data: [], error: null }; } };
    await expect(applyProjectFactPatch(database, PROJECT_N, [{ key: "price", value: 1000 }]))
      .rejects.toBeInstanceOf(z.ZodError);
    await expect(applyProjectFactPatch(database, PROJECT_N, [{ key: "postal_code", value: "abc" }]))
      .rejects.toBeInstanceOf(z.ZodError);
    await expect(applyProjectFactPatch(database, PROJECT_N, [
      { key: "city", value: "Köln" }, { key: "city", value: "Bonn" },
    ])).rejects.toBeInstanceOf(z.ZodError);
    expect(calls).toBe(0);
  });

  it("keeps the migration narrow, server-written, and independent of legacy claims", () => {
    const sql = readFileSync("supabase/migrations/202609130003_mvp_project_facts.sql", "utf8");
    expect(sql).toContain("unique (project_id, fact_key)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("grant execute on function public.get_mvp_project_facts(uuid)");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/customer_answer_(?:claim_evidence|knowledge_claims|knowledge_transitions)/u);
    expect(sql).not.toMatch(/openai|provider sdk/iu);
  });
});
