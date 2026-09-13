import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609130001_close_delivery_dispatch_fence.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

describe("Step 2 close/delivery dispatch fence", () => {
  it("serializes close and final authorization on the original Conversation", () => {
    expect(sql.match(/from public\.conversations where id=.*for update/g)).toHaveLength(2);
    expect(normalized).toContain("d.conversation_id<>c.id");
    expect(normalized).toContain("b.conversation_id=c.id");
    expect(normalized).toContain("b.transport_identity_id=d.transport_identity_id");
    expect(normalized).toContain("b.id=d.transport_binding_id");
  });

  it("rechecks open lifecycle, active Binding, and current Pending state at authorization", () => {
    expect(normalized).toContain("if c.status<>'open'");
    expect(normalized).toContain("b.provider='whatsapp' and b.status='active' and i.status='active'");
    expect(normalized).toContain("r.conversation_id=c.id and r.active_pending_interaction_id=p.id");
    expect(normalized).toContain("return jsonb_build_object('status','lifecycle_blocked')");
  });

  it("lets an already-authorized attempt finish before close can succeed", () => {
    const close = normalized.slice(normalized.indexOf("create or replace function public.transition_conversation_status"));
    expect(close).toContain("a.delivery_command_id=d.id and a.finished_at is null");
    expect(close).toContain("d.conversation_id=c.id and d.provider='whatsapp'");
    expect(close).toContain("raise exception 'conversation_dispatch_in_progress'");
    expect(close.indexOf("conversation_dispatch_in_progress")).toBeLessThan(close.indexOf("update public.conversations set status=target_status"));
  });

  it("preserves completed attempts and all historical delivery rows", () => {
    expect(normalized).toContain("a.finished_at is null");
    expect(normalized).not.toMatch(/delete from|truncate|recovery_of_snapshot_id\s*=|disable trigger/);
  });

  it("keeps authorities least-privileged", () => {
    expect(normalized).toContain("auth.role()<>'service_role'");
    expect(normalized).toContain("perform public.assert_conversation_admin()");
    expect(normalized).toContain("to service_role");
    expect(normalized).toContain("to authenticated");
  });
});
