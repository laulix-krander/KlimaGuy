import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validateTransportImage, TRANSPORT_MEDIA_MAX_ATTEMPTS } from "@/lib/domain/transport-media";
import type { WhatsAppInboundImage } from "./contracts";
import { downloadWhatsAppImage, type MetaMediaResult } from "./meta-media-adapter";

const uuid=z.string().uuid();
const persistenceSchema=z.object({status:z.enum(["recorded","duplicate"]),receipt_id:uuid,conversation_id:uuid,internal_message_id:uuid,ingestion_command_id:uuid,cycle_eligible:z.literal(false)}).strict();
const claimSchema=z.object({status:z.enum(["claimed","busy","terminal","completed"]),command_id:uuid,conversation_id:uuid,source_message_id:uuid,provider_media_reference:z.string().min(1).max(512).nullable(),declared_mime_type:z.string().nullable(),attempt_count:z.number().int().min(0).max(TRANSPORT_MEDIA_MAX_ATTEMPTS)}).strict();
const reservationSchema=z.object({status:z.enum(["reserved","replayed"]),staging_asset_id:uuid,project_media_id:uuid,staging_path:z.string(),project_bucket:z.literal("project-media"),project_path:z.string()}).strict();
export type WhatsAppImagePersistence=(event:WhatsAppInboundImage)=>Promise<z.infer<typeof persistenceSchema>>;
export type ImageIngestionResult={kind:"completed";projectMediaId:string}|{kind:"duplicate"|"deferred"|"failed"};

type Db={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>;storage:{from(bucket:string):{upload(path:string,body:Uint8Array,options:{contentType:string;upsert:false}):Promise<{error:unknown}>}}};
function client():Db { const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("configuration_error");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}}) as unknown as Db; }

export const persistWhatsAppInboundImage:WhatsAppImagePersistence=async(event)=>{
  const {data,error}=await client().rpc("ingest_transport_inbound_image",{target_sender_scope:event.sender_scope,target_external_identity:event.external_sender_identity,target_provider_message_id:event.provider_message_id,target_provider_media_reference:event.provider_media_id,target_occurred_at:event.provider_occurred_at,target_caption:event.caption??null,target_declared_mime_type:event.declared_mime_type??null});
  if(error)throw new Error("image_persistence_failed");const parsed=persistenceSchema.safeParse(data);if(!parsed.success)throw new Error("image_persistence_failed");return parsed.data;
};

export async function runWhatsAppImageIngestion(input:{commandId:string},dependencies:{db?:Db;download?:()=>Promise<MetaMediaResult>;configuration?:()=>{accessToken?:string;graphApiVersion?:string}}={}):Promise<ImageIngestionResult>{
  const db=dependencies.db??client();
  const {data,error}=await db.rpc("claim_transport_media_ingestion",{target_command_id:input.commandId});
  const claim=claimSchema.safeParse(data);if(error||!claim.success)return {kind:"failed"};
  if(claim.data.status==="completed")return {kind:"duplicate"}; if(claim.data.status!=="claimed"||!claim.data.provider_media_reference)return {kind:"deferred"};
  const config=(dependencies.configuration??(()=>({accessToken:process.env.WHATSAPP_ACCESS_TOKEN,graphApiVersion:process.env.WHATSAPP_GRAPH_API_VERSION})))();
  const downloaded=await (dependencies.download??(()=>downloadWhatsAppImage({mediaId:claim.data.provider_media_reference!,accessToken:config.accessToken??"",graphApiVersion:config.graphApiVersion??""})))();
  if(!downloaded.success){await db.rpc("fail_transport_media_ingestion",{target_command_id:input.commandId,target_failure_code:downloaded.failureCode,target_retryable:downloaded.retryable});return {kind:downloaded.retryable&&claim.data.attempt_count<TRANSPORT_MEDIA_MAX_ATTEMPTS?"deferred":"failed"};}
  const validation=validateTransportImage({bytes:downloaded.bytes,declaredMimeType:downloaded.declaredMimeType,httpContentType:downloaded.httpContentType});
  if(!validation.success){await db.rpc("fail_transport_media_ingestion",{target_command_id:input.commandId,target_failure_code:validation.failureCode,target_retryable:false});return {kind:"failed"};}
  const reserved=await db.rpc("reserve_transport_media_promotion",{target_command_id:input.commandId,target_mime_type:validation.mimeType,target_byte_size:downloaded.bytes.byteLength});
  const reservation=reservationSchema.safeParse(reserved.data);if(reserved.error||!reservation.success)return {kind:"failed"};
  const staging=await db.storage.from("transport-media-staging").upload(reservation.data.staging_path,downloaded.bytes,{contentType:validation.mimeType,upsert:false});
  if(staging.error){await db.rpc("fail_transport_media_ingestion",{target_command_id:input.commandId,target_failure_code:"staging_storage_failed",target_retryable:true});return {kind:"deferred"};}
  const durable=await db.storage.from(reservation.data.project_bucket).upload(reservation.data.project_path,downloaded.bytes,{contentType:validation.mimeType,upsert:false});
  if(durable.error){await db.rpc("fail_transport_media_ingestion",{target_command_id:input.commandId,target_failure_code:"staging_storage_failed",target_retryable:true});return {kind:"deferred"};}
  const finalized=await db.rpc("finalize_transport_media_promotion",{target_command_id:input.commandId,target_staging_asset_id:reservation.data.staging_asset_id,target_project_media_id:reservation.data.project_media_id});
  return finalized.error||finalized.data!==true?{kind:"deferred"}:{kind:"completed",projectMediaId:reservation.data.project_media_id};
}
