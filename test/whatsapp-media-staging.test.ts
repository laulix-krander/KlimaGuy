import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  TRANSPORT_MEDIA_MAX_IMAGE_BYTES,
  detectTransportImageMime,
  transportMediaIngestionCommandDtoSchema,
  validateTransportImage,
} from "@/lib/domain/transport-media";
import { putStagedWhatsAppImage } from "@/lib/server/whatsapp/media-staging-adapter";

const migration = readFileSync("supabase/migrations/202608240003_whatsapp_media_safe_staging.sql", "utf8");
const id = "8f5d6648-a300-4a28-901b-22121ec8c024";
const jpeg = new Uint8Array([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0,0,0]);
const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const webp = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);

describe("AP-16-05-01 image safety boundary", () => {
  it("accepts only matching JPEG, PNG and WebP signatures", () => {
    for (const [bytes, mime] of [[jpeg,"image/jpeg"],[png,"image/png"],[webp,"image/webp"]] as const) {
      expect(detectTransportImageMime(bytes)).toBe(mime);
      expect(validateTransportImage({ bytes, declaredMimeType:mime, httpContentType:mime })).toEqual({success:true,mimeType:mime});
    }
  });

  it("fails closed for masquerading, mismatch, unsupported type and oversize", () => {
    expect(validateTransportImage({bytes:new TextEncoder().encode("%PDF-1.7"),declaredMimeType:"image/jpeg",httpContentType:"image/jpeg"})).toMatchObject({failureCode:"media_integrity_mismatch"});
    expect(validateTransportImage({bytes:png,declaredMimeType:"image/png",httpContentType:"image/jpeg"})).toMatchObject({failureCode:"media_integrity_mismatch"});
    expect(validateTransportImage({bytes:jpeg,declaredMimeType:"image/gif",httpContentType:"image/gif"})).toMatchObject({failureCode:"unsupported_media_type"});
    expect(validateTransportImage({bytes:new Uint8Array(TRANSPORT_MEDIA_MAX_IMAGE_BYTES+1),declaredMimeType:"image/jpeg",httpContentType:"image/jpeg"})).toMatchObject({failureCode:"media_too_large"});
  });

  it("uses one generated private locator and no caller-controlled path", async () => {
    const upload=vi.fn().mockResolvedValue({error:null});
    const result=await putStagedWhatsAppImage({stagingAssetId:id,bytes:jpeg,declaredMimeType:"image/jpeg",httpContentType:"image/jpeg"},{storage:{from:vi.fn(() => ({upload}))}});
    expect(result).toMatchObject({success:true,mimeType:"image/jpeg"});
    expect(upload).toHaveBeenCalledWith(`assets/${id}/original.jpg`,jpeg,{contentType:"image/jpeg",upsert:false});
  });

  it("keeps the normal command DTO free of provider and storage secrets", () => {
    const safe={commandId:id,sourceMessageId:id,conversationId:id,status:"pending",attemptCount:0,stagingAssetId:null,failureCode:null,completedAt:null};
    expect(transportMediaIngestionCommandDtoSchema.parse(safe)).toEqual(safe);
    for (const extra of ["providerMediaId","providerMessageId","url","accessToken","caption","storagePath"]) {
      expect(() => transportMediaIngestionCommandDtoSchema.parse({...safe,[extra]:"secret"})).toThrow();
    }
  });
});

describe("AP-16-05-01 persistent authority", () => {
  it("atomically binds receipt, image_reference, provider binding, attachment and one command", () => {
    for (const value of ["transport_message_attachments","transport_media_ingestion_commands","transport_media_staging_assets","'image_reference'","conversation_message_references","transport_message_bindings"]) expect(migration).toContain(value);
    expect(migration).toContain("source_message_id uuid not null unique");
    expect(migration).toContain("provider_message_binding_id uuid not null unique");
    expect(migration).toContain("on conflict(provider,sender_scope,provider_event_identity) do nothing");
    expect(migration).toContain("'cycle_eligible',false");
  });

  it("preserves caption as isolated content and never assigns a project", () => {
    expect(migration).toContain("values(message_row.id,message_binding.id,target_provider_media_reference,target_caption)");
    expect(migration).toContain("values(identity_row.customer_id,null,'open'");
    expect(migration).not.toMatch(/update public\.conversations set current_project_id/i);
    expect(migration).toContain("check(project_media_id is null)");
    expect(migration).not.toMatch(/insert into public\.project_(media|evidence)/i);
  });

  it("uses private storage, deny-by-default RLS, narrow grants and UUID-only paths", () => {
    expect(migration).toContain("'transport-media-staging','transport-media-staging',false,15000000");
    for (const table of ["transport_message_attachments","transport_media_ingestion_commands","transport_media_staging_assets"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration.replaceAll("\n", " ")).not.toMatch(/create policy.*transport.media.staging/i);
    expect(migration).not.toMatch(/signed.url|createSignedUrl/i);
  });

  it("sanitizes audit and records the blocked official contract", () => {
    const auditMetadata=[...migration.matchAll(/jsonb_build_object\(([^;]+)\)/g)].map(x=>x[1]).join("\n");
    expect(auditMetadata).not.toMatch(/target_caption|target_provider_media_reference|target_provider_message_id|target_sender_scope|target_external_identity|storage_path|access.token|url|filename|byte_size/i);
    expect(migration).toContain("'provider_contract_unavailable','configuration'");
    expect(migration).not.toMatch(/fetch\(|graph\.facebook|Authorization|Bearer/i);
  });
});
