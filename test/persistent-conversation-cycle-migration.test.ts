import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202608230006_persistent_live_conversation_cycle.sql", "utf8");
describe("AP-16-03 migration", () => {
  it("has closed commands, message idempotency and conversation serialization", () => {
    expect(sql).toContain("conversation_cycle_commands");
    expect(sql).toContain("'pending','processing','completed','failed','stale','human_review_required'");
    expect(sql).toContain("one_customer_answer_cycle_per_message");
    expect(sql).toContain("one_processing_cycle_per_conversation");
  });
  it("binds an interaction to its exact outbound prompt", () => expect(sql).toContain("prompt_message_id uuid references public.conversation_messages"));
  it("does not grant browser mutation", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.conversation_cycle_commands from public,anon,authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });
  it("documents the deterministic lock order and excludes content from commands", () => {
    expect(sql).toContain("Stable lock order: conversations, conversation_runtime_states, conversation_pending_interactions");
    expect(sql).not.toMatch(/\b(provider_id|phone_number|normalized_answer|message_text)\s+(text|jsonb)/i);
  });
});
