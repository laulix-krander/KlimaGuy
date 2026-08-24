import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PINNED_WHATSAPP_GRAPH_API_VERSION, sendWhatsAppText, type WhatsAppSendResult } from "./outbound-adapter";

const claimSchema = z.object({ delivery_command_id:z.string().uuid(), claim_token:z.string().uuid(), destination:z.string().min(1), text:z.string().min(1), sender_scope:z.string().min(1), status:z.enum(["sending","replay","blocked"]) }).strict();
export type DeliveryPersistence = {
  claim(messageId:string):Promise<z.infer<typeof claimSchema>>;
  revalidate(commandId:string,claimToken:string):Promise<boolean>;
  complete(commandId:string,claimToken:string,result:WhatsAppSendResult):Promise<void>;
};
function client() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("configuration_error");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
const persistence:DeliveryPersistence={
  async claim(messageId){const {data,error}=await client().rpc("claim_whatsapp_outbound_delivery",{target_internal_message_id:messageId});if(error)throw new Error("delivery_claim_failed");return claimSchema.parse(data);},
  async revalidate(commandId,claimToken){const {data,error}=await client().rpc("revalidate_whatsapp_outbound_delivery",{target_delivery_command_id:commandId,target_claim_token:claimToken});if(error)throw new Error("delivery_revalidation_failed");return data===true;},
  async complete(commandId,claimToken,result){const {error}=await client().rpc("complete_whatsapp_outbound_delivery",{target_delivery_command_id:commandId,target_claim_token:claimToken,target_success:result.success,target_provider_message_id:result.success?result.providerMessageId:null,target_failure_code:result.success?null:result.failureCode,target_retry_classification:result.success?null:result.retryClassification,target_provider_accepted_at:result.success?result.acceptedAt:null});if(error)throw new Error("delivery_completion_failed");},
};

export async function deliverPendingWhatsAppMessage(input:{internal_message_id:string}, deps:{store?:DeliveryPersistence;send?:typeof sendWhatsAppText;env?:Partial<NodeJS.ProcessEnv>}={}):Promise<{deliveryCommandId:string;status:string}> {
  const messageId=z.string().uuid().parse(input.internal_message_id), store=deps.store??persistence, env=deps.env??process.env;
  const claimed=await store.claim(messageId);
  if(claimed.status!=="sending") return {deliveryCommandId:claimed.delivery_command_id,status:claimed.status};
  if(!await store.revalidate(claimed.delivery_command_id,claimed.claim_token)) return {deliveryCommandId:claimed.delivery_command_id,status:"blocked"};
  const accessToken=env.WHATSAPP_ACCESS_TOKEN, phoneNumberId=env.WHATSAPP_PHONE_NUMBER_ID, version=env.WHATSAPP_GRAPH_API_VERSION;
  if(!accessToken||!phoneNumberId||version!==PINNED_WHATSAPP_GRAPH_API_VERSION){
    const result:WhatsAppSendResult={success:false,failureCode:"provider_auth_error",retryClassification:"configuration",providerSafeCode:null};
    await store.complete(claimed.delivery_command_id,claimed.claim_token,result); return {deliveryCommandId:claimed.delivery_command_id,status:"failed"};
  }
  const result=await (deps.send??sendWhatsAppText)({destination:claimed.destination,text:claimed.text,phoneNumberId,accessToken,graphApiVersion:version});
  try { await store.complete(claimed.delivery_command_id,claimed.claim_token,result); } catch { throw new Error("delivery_completion_requires_reconciliation"); }
  return {deliveryCommandId:claimed.delivery_command_id,status:result.success?"accepted_by_provider":result.failureCode==="ambiguous_send_result"?"delivery_ambiguous":"failed"};
}
