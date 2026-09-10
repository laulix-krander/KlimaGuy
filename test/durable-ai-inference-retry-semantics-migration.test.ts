import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/202609100002_durable_ai_inference_retry_semantics.sql","utf8");
describe("AP-16-06-06D-17 durable inference authority",()=>{
 it("persists only provider-neutral validated result fields behind RLS and service authority",()=>{
  expect(sql).toContain("create table public.customer_answer_ai_inference_results");
  expect(sql).toContain("enable row level security"); expect(sql).toContain("auth.role() is distinct from 'service_role'");
  for(const forbidden of ["full_prompt","customer_text","raw_provider_response","http_headers","credentials"])expect(sql).not.toContain(forbidden);
 });
 it("binds lookup and persistence to immutable command authority",()=>{
  for(const binding of ["target_command_id","target_source_message_id","target_pending_interaction_id","target_conversation_id","target_project_id","target_decision_id","expected_runtime_revision","expected_knowledge_version","target_information_key"])expect(sql).toContain(binding);
  expect(sql).toContain("p.answered_by_message_id is null"); expect(sql).toContain("cmd.execution_owner_id=execution_owner_id");
 });
 it("admits v1 exhaustion once but excludes current-semantics exhaustion",()=>{
  expect(sql).toContain("cmd.inference_semantics_version=1"); expect(sql).toContain("legacy_ai_exhaustion_rehabilitated_at is null");
  expect(sql).toContain("cmd.legacy_ai_exhaustion_rehabilitated_at is not null and cmd.current_semantics_ai_attempt_count>=1");
  expect(sql).not.toMatch(/set\s+ai_inference_attempt_count\s*=\s*0/i);
 });
});
