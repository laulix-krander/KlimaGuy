import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/202608230004_persistent_conversation_message_authority.sql", "utf8");
describe("conversation authority migration", () => {
 it("creates UUID authorities, assignment history and deterministic sequence", () => {
  expect(sql).toContain("create table public.conversations"); expect(sql).toContain("create table public.conversation_messages");
  expect(sql).toContain("create table public.conversation_project_assignments"); expect(sql).toContain("unique(conversation_id,sequence)");
  expect(sql).toContain("unique(conversation_id,idempotency_key)");
 });
 it("makes messages and assignment history append-only", () => {
  expect(sql).toContain("conversation_messages_append_only"); expect(sql).toContain("conversation_assignments_append_only");
  expect(sql).toContain("raise exception 'append_only_authority'"); expect(sql).toContain("on delete restrict");
 });
 it("enables RLS, revokes broad mutation, and isolates unassigned conversations", () => {
  for (const table of ["conversations","conversation_project_assignments","conversation_state_commands","conversation_messages","conversation_message_text","conversation_message_references"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
  expect(sql).toContain("revoke all on public.conversations"); expect(sql).toContain("current_project_id is not null or public.current_app_role()='admin'");
  expect(sql).not.toContain("grant insert"); expect(sql).not.toContain("grant update"); expect(sql).not.toContain("grant delete");
 });
 it("keeps audit metadata free of message text and exposes no transport columns", () => {
  const audit = sql.match(/'conversation_message_recorded'[\s\S]*?return public\.message_dto/)?.[0] ?? "";
  expect(audit).not.toContain("target_text"); expect(audit).not.toContain("body");
  expect(sql).not.toMatch(/provider_(conversation|message)_id|whatsapp_message_id|phone_number_id|signed_url|storage_path/i);
 });
 it("provides CAS, same-conversation replies, closed blocking, and limited keyset reads", () => {
  expect(sql).toContain("c.revision<>expected_revision"); expect(sql).toContain("reply.conversation_id<>c.id"); expect(sql).toContain("c.status='closed'");
  expect(sql).toContain("m.sequence>greatest(cursor_sequence,0)"); expect(sql).toContain("limit least(greatest(page_limit,1),100)");
 });
});
