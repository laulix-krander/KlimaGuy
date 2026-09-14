import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const sql=readFileSync("supabase/migrations/202609140002_productive_whatsapp_image_ingestion.sql","utf8");

describe("productive WhatsApp image persistence authority",()=>{
 it("reuses receipt dedupe and creates pending work instead of blocked proof work",()=>{expect(sql).toContain("on conflict(provider,sender_scope,provider_event_identity) do nothing");expect(sql).toContain("'status','duplicate'");expect(sql).toContain("conversation_messages");expect(sql).toMatch(/conversation_id,status\) values\(message_row\.id,message_binding\.id,identity_row\.id,conversation_row\.id,'pending'\)/);});
 it("preserves complete current-project provenance exactly once",()=>{for(const value of ["source_conversation_id","source_message_id","source_attachment_id","project_media_source_message_key"])expect(sql).toContain(value);expect(sql).toContain("source='whatsapp'");expect(sql).toContain("upload_status='ready'");});
 it("fences promotion against close, binding supersession, and project advancement",()=>{expect(sql).toContain("conv.status<>'open'");expect(sql).toContain("conv.current_project_id<>media.project_id");expect(sql).toContain("status='active'");expect(sql).toContain("source_conversation_id=conv.id");});
 it("uses the existing private staging locator plus durable bucket and bounded terminal recovery",()=>{expect(sql).toContain("asset.storage_bucket");expect(sql).toContain("'project-media'");expect(sql).toContain("attempt_count<3");expect(sql).toContain("'terminal'::public.transport_media_retry_classification");expect(sql).not.toMatch(/openai|signed.?url/i);});
});
