import "server-only";

import { z } from "zod";
import { TRANSPORT_MEDIA_MAX_IMAGE_BYTES } from "@/lib/domain/transport-media";
import { PINNED_WHATSAPP_GRAPH_API_VERSION } from "./outbound-adapter";

const metadataSchema=z.object({url:z.string().url(),mime_type:z.string().min(1).max(255),file_size:z.number().int().positive().max(TRANSPORT_MEDIA_MAX_IMAGE_BYTES).optional()}).passthrough();
export type MetaMediaResult={success:true;bytes:Uint8Array;declaredMimeType:string;httpContentType:string}|{success:false;failureCode:"configuration_error"|"provider_auth_error"|"provider_media_not_found"|"provider_metadata_transient"|"provider_download_transient"|"media_too_large"|"download_timeout";retryable:boolean};

export async function downloadWhatsAppImage(input:{mediaId:string;accessToken:string;graphApiVersion:string},fetcher:typeof fetch=fetch):Promise<MetaMediaResult>{
  if (!input.accessToken || input.graphApiVersion!==PINNED_WHATSAPP_GRAPH_API_VERSION) return {success:false,failureCode:"configuration_error",retryable:false};
  const headers={authorization:`Bearer ${input.accessToken}`};
  let metadataResponse:Response;
  try { metadataResponse=await fetcher(`https://graph.facebook.com/${input.graphApiVersion}/${encodeURIComponent(input.mediaId)}`,{headers,signal:AbortSignal.timeout(15_000)}); }
  catch(error) { return {success:false,failureCode:error instanceof DOMException&&error.name==="TimeoutError"?"download_timeout":"provider_metadata_transient",retryable:true}; }
  if(metadataResponse.status===401||metadataResponse.status===403)return {success:false,failureCode:"provider_auth_error",retryable:false};
  if(metadataResponse.status===404)return {success:false,failureCode:"provider_media_not_found",retryable:false};
  if(!metadataResponse.ok)return {success:false,failureCode:"provider_metadata_transient",retryable:metadataResponse.status>=500||metadataResponse.status===429};
  const metadata=metadataSchema.safeParse(await metadataResponse.json().catch(()=>null));
  if(!metadata.success)return {success:false,failureCode:"provider_metadata_transient",retryable:false};
  let download:Response;
  try { download=await fetcher(metadata.data.url,{headers,signal:AbortSignal.timeout(30_000)}); }
  catch(error) { return {success:false,failureCode:error instanceof DOMException&&error.name==="TimeoutError"?"download_timeout":"provider_download_transient",retryable:true}; }
  if(download.status===401||download.status===403)return {success:false,failureCode:"provider_auth_error",retryable:false};
  if(!download.ok||!download.body)return {success:false,failureCode:"provider_download_transient",retryable:download.status>=500||download.status===429};
  const declared=download.headers.get("content-length");
  if(declared&&Number(declared)>TRANSPORT_MEDIA_MAX_IMAGE_BYTES)return {success:false,failureCode:"media_too_large",retryable:false};
  const reader=download.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>TRANSPORT_MEDIA_MAX_IMAGE_BYTES){await reader.cancel();return {success:false,failureCode:"media_too_large",retryable:false};}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return {success:true,bytes,declaredMimeType:metadata.data.mime_type,httpContentType:(download.headers.get("content-type")??"").split(";")[0].trim()};
}
