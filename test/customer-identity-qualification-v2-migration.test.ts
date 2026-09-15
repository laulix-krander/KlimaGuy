import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609150001_customer_identity_qualification_v2.sql";
const sql = readFileSync(migrationPath, "utf8");
const store = readFileSync("lib/server/conversation/mvp-conversation-turn.ts", "utf8");

describe("Customer identity and Qualification V2 migration contract", () => {
  it("locks the exact acquire and commit RPC argument names", () => {
    expect(sql).toMatch(/acquire_mvp_ai_turn\(target_conversation_id uuid,target_inbound_message_id uuid\)/u);
    expect(sql).toMatch(/commit_mvp_ai_turn\(target_turn_id uuid, target_facts_patch jsonb,\s*target_customer_name_patch jsonb, target_reply_text text, target_qualification_status text, target_needs_human boolean, target_human_reason text\)/u);
    expect(store).toContain("target_conversation_id: conversationId, target_inbound_message_id: inboundMessageId");
    for (const argument of ["target_turn_id", "target_facts_patch", "target_customer_name_patch", "target_reply_text", "target_qualification_status", "target_needs_human", "target_human_reason"]) expect(store).toContain(argument);
  });

  it("projects only the bound Customer name and derives name_known for full and partial names", () => {
    expect(sql).toMatch(/customer_id=c\.customer_id/u);
    expect(sql).toMatch(/where id=c\.customer_id and id=p\.customer_id[^;]+for update/u);
    expect(sql).toContain("'name_known',nullif(btrim(customer_row.first_name),'') is not null or nullif(btrim(customer_row.last_name),'') is not null");
    expect(sql).not.toMatch(/'customer_id'|'phone'|'email'|'external_identity'|'sender_scope'/u);
  });

  it("fills only null name components after every lifecycle fence", () => {
    const fence = sql.indexOf("if c.status<>'open'");
    const customerUpdate = sql.indexOf("update public.customers set");
    expect(customerUpdate).toBeGreaterThan(fence);
    expect(sql).toContain("first_name=case when first_name is null");
    expect(sql).toContain("last_name=case when last_name is null");
    expect(sql).toContain("p.customer_id<>c.customer_id");
  });

  it("keeps server readiness deterministic without photos or Offer side effects", () => {
    for (const key of ["postal_code", "city", "building_type", "room_type", "room_area_sqm", "estimated_line_length_m", "condensate_drainage", "electrical_supply", "installation_access"]) expect(sql).toContain(`'${key}'`);
    expect(sql).toContain("special_access_required");
    expect(sql).toContain("target_qualification_status='ready_for_offer' and not server_ready");
    expect(sql).not.toMatch(/insert into public\.(project_offers|qualification_runs)/u);
  });
});
