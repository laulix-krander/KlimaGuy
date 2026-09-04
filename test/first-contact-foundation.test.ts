import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { bootstrapFirstContactFoundation, type FirstContactFoundationDataSource } from "@/lib/server/conversation/first-contact-foundation";

const migration = readFileSync("supabase/migrations/202609040001_first_contact_foundation.sql", "utf8");
const ID = "10000000-0000-4000-8000-000000000001";
const success = { status: "created", conversation_id: ID, customer_id: ID, project_id: ID, conversation_revision: 2, knowledge_state_version: 1, runtime_revision: 1, runtime_status: "idle" };

describe("first contact foundation adapter", () => {
  it("accepts the closed success union and sends only persisted conversation identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: success, error: null });
    await expect(bootstrapFirstContactFoundation({ rpc }, ID)).resolves.toEqual(success);
    expect(rpc).toHaveBeenCalledWith("bootstrap_first_contact_foundation", { target_conversation_id: ID });
  });

  it("maps invalid input, database errors, malformed payloads and raw details to closed failures", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "surprise", phone: "+49123" }, error: { message: "raw" } });
    await expect(bootstrapFirstContactFoundation({ rpc }, "phone-number")).resolves.toEqual({ status: "invalid_state" });
    await expect(bootstrapFirstContactFoundation({ rpc } as FirstContactFoundationDataSource, ID)).resolves.toEqual({ status: "persistence_failure" });
    expect(JSON.stringify(await bootstrapFirstContactFoundation({ rpc } as FirstContactFoundationDataSource, ID))).not.toContain("raw");
  });
});

describe("first contact foundation migration", () => {
  it("makes names nullable while the manual Zod create contract remains untouched", () => {
    expect(migration).toMatch(/customers alter column first_name drop not null/);
    expect(migration).toMatch(/customers alter column last_name drop not null/);
    expect(migration).toMatch(/values\(null,null,null,null,actor_id\)/);
    expect(migration).not.toMatch(/Unbekannt|WhatsApp|Neuer Kunde/);
  });

  it("resolves the actor internally and attributes every created domain record", () => {
    expect(migration).toMatch(/actor_result:=public\.resolve_system_actor\(\)/);
    expect(migration).not.toMatch(/bootstrap_first_contact_foundation\([^)]*actor/i);
    expect(migration).toMatch(/customers\(first_name,last_name,email,phone,created_by\)/);
    expect(migration).toMatch(/projects\(customer_id,title,created_by\)/);
    expect(migration).toMatch(/assignment_revision,action,actor_id,idempotency_key/);
  });

  it("locks transport before conversation and uses the transport identity as idempotency anchor", () => {
    const identityLock = migration.indexOf("conversation_transport_identities where id=identity_row.id for update");
    const conversationLock = migration.indexOf("conversations where id=target_conversation_id for update");
    expect(identityLock).toBeGreaterThan(0);
    expect(conversationLock).toBeGreaterThan(identityLock);
    expect(migration).toMatch(/'first-contact-foundation:'\|\|identity_row\.id/g);
    expect(migration).toMatch(/if identity_row\.customer_id is not null and conversation_row\.customer_id is not null/);
  });

  it("creates the exact minimal project, empty version-one knowledge and idle runtime", () => {
    expect(migration).toContain("values(customer_row.id,'Neue Klimaanfrage',actor_id)");
    expect(migration).toMatch(/project_knowledge_states\(project_id,current_version,schema_version\)[\s\S]*values\(project_row\.id,1,1\)/);
    expect(migration).toMatch(/values\(conversation_row\.id,project_row\.id,1,knowledge_row\.current_version,'idle'\)/);
    expect(migration).not.toMatch(/apply_customer_answer_knowledge_transition|insert into public\.conversation_pending_interactions|insert into public\.conversation_interaction_snapshots|insert into public\.transport_delivery_commands/i);
  });

  it("preserves existing knowledge/runtime and fails closed on binding/project conflicts", () => {
    expect(migration).toMatch(/on conflict\(project_id\) do nothing/);
    expect(migration).toMatch(/conversation_runtime_states where conversation_id=conversation_row\.id for update/);
    expect(migration).not.toMatch(/update public\.conversation_runtime_states/);
    expect(migration.match(/raise exception 'foundation_conflict'/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("is one transactional SECURITY DEFINER authority with rollback and service-only grants", () => {
    expect(migration).toMatch(/returns jsonb language plpgsql security definer set search_path=public,pg_temp/);
    expect(migration).toMatch(/exception when others[\s\S]*'persistence_failure'/);
    expect(migration).toMatch(/revoke execute[^]*from public,anon,authenticated/);
    expect(migration).toMatch(/grant execute[^]*to service_role/);
  });
});
