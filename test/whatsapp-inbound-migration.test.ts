import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202608240001_whatsapp_inbound_text_ingestion.sql", "utf8");

describe("AP-16-04-01-01 atomic inbound authority", () => {
  it("is service-only, transactional and uses both durable dedupe authorities", () => {
    expect(migration).toContain("create function public.ingest_whatsapp_inbound_text");
    expect(migration).toContain("security definer set search_path=public,pg_temp");
    expect(migration).toContain("on conflict(provider,sender_scope,provider_event_identity) do nothing");
    expect(migration).toContain("provider_message_id");
    expect(migration).toContain("grant execute on function public.ingest_whatsapp_inbound_text(text,text,text,timestamptz,text) to service_role");
    expect(migration).toContain("from public,anon,authenticated");
  });

  it("creates unassigned conversations and supersedes closed bindings without project guessing", () => {
    expect(migration).toContain("values(identity_row.customer_id,null,'open'");
    expect(migration).toContain("conversation_row.status='closed'");
    expect(migration).toContain("set status='superseded'");
    expect(migration).not.toMatch(/customers\.phone|latest|order by.*conversation|current_project_id\s*=\s*identity/i);
  });

  it("records exact customer text and keeps provider identity outside Message Core", () => {
    expect(migration).toContain("'inbound','text','customer',target_occurred_at");
    expect(migration).toContain("conversation_message_text(message_id,body) values(message_row.id,target_text)");
    expect(migration).not.toMatch(/alter table public\.conversation_messages add/);
    expect(migration).not.toMatch(/alter table public\.conversations add.*provider/i);
  });

  it("keeps sanitized audit metadata free from transport PII and content", () => {
    const auditMetadata = [...migration.matchAll(/jsonb_build_object\(([^;]+)\)/g)].map((match) => match[1]).join("\n");
    expect(auditMetadata).not.toMatch(/target_text|target_external_identity|target_sender_scope|target_provider_message_id|raw_payload|signature|secret/);
    for (const action of ["whatsapp_webhook_received", "whatsapp_webhook_replayed", "whatsapp_inbound_text_recorded", "whatsapp_transport_identity_created", "whatsapp_conversation_bound"]) expect(migration).toContain(action);
  });
});
