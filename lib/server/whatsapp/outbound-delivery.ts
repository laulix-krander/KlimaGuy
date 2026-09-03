import "server-only";

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PINNED_WHATSAPP_GRAPH_API_VERSION, sendWhatsAppText, type WhatsAppSendResult } from "./outbound-adapter";

const uuid = z.string().uuid();
const claimSchema = z.object({
  delivery_command_id:uuid, claim_token:uuid, destination:z.string().min(1), text:z.string().min(1),
  sender_scope:z.string().min(1), status:z.enum(["sending","replay","blocked","not_due","terminal"]),
}).strict();
const dispatchSchema = z.discriminatedUnion("status", [
  z.object({status:z.literal("authorized"),delivery_command_id:uuid,attempt_number:z.number().int().min(1).max(3),dispatch_token:uuid,dispatch_started_at:z.string().datetime({offset:true})}).strict(),
  z.object({status:z.enum(["already_authorized","not_eligible","attempts_exhausted","not_authorized"])}).passthrough(),
]);
const completionSchema = z.object({status:z.enum(["completed","stale_attempt","invalid_result","binding_conflict","not_authorized"])}).strict();
const preDispatchSchema = z.object({status:z.enum(["completed","stale_claim","dispatch_possible","invalid_result","not_authorized"])}).strict();
type AuthorizedDispatch = Extract<z.infer<typeof dispatchSchema>, {status:"authorized"}>;

export type DeliveryPersistence = {
  claim(messageId:string):Promise<z.infer<typeof claimSchema>>;
  revalidate(commandId:string,claimToken:string):Promise<boolean>;
  authorize(commandId:string,claimToken:string,dispatchToken:string):Promise<z.infer<typeof dispatchSchema>>;
  failPreDispatch(commandId:string,claimToken:string):Promise<z.infer<typeof preDispatchSchema>>;
  complete(commandId:string,claimToken:string,dispatch:AuthorizedDispatch,result:WhatsAppSendResult):Promise<z.infer<typeof completionSchema>>;
};

function client() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("delivery_configuration_error");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}

const persistence:DeliveryPersistence={
  async claim(messageId){const {data,error}=await client().rpc("claim_whatsapp_outbound_delivery",{target_internal_message_id:messageId});if(error)throw new Error("delivery_claim_failed");return claimSchema.parse(data);},
  async revalidate(commandId,claimToken){const {data,error}=await client().rpc("revalidate_whatsapp_outbound_delivery",{target_delivery_command_id:commandId,target_claim_token:claimToken});if(error)throw new Error("delivery_revalidation_failed");return data===true;},
  async authorize(commandId,claimToken,dispatchToken){const {data,error}=await client().rpc("authorize_whatsapp_outbound_dispatch",{target_delivery_command_id:commandId,target_claim_token:claimToken,target_dispatch_token:dispatchToken});if(error)throw new Error("delivery_dispatch_authorization_failed");return dispatchSchema.parse(data);},
  async failPreDispatch(commandId,claimToken){const {data,error}=await client().rpc("fail_whatsapp_outbound_pre_dispatch",{target_delivery_command_id:commandId,target_claim_token:claimToken,target_failure_code:"provider_auth_error",target_retry_classification:"configuration"});if(error)throw new Error("delivery_pre_dispatch_completion_failed");return preDispatchSchema.parse(data);},
  async complete(commandId,claimToken,dispatch,result){const {data,error}=await client().rpc("complete_whatsapp_outbound_delivery",{target_delivery_command_id:commandId,target_claim_token:claimToken,target_dispatch_token:dispatch.dispatch_token,target_attempt_number:dispatch.attempt_number,target_success:result.success,target_provider_message_id:result.success?result.providerMessageId:null,target_failure_code:result.success?null:result.failureCode,target_retry_classification:result.success?null:result.retryClassification,target_provider_accepted_at:result.success?result.acceptedAt:null});if(error)throw new Error("delivery_completion_failed");return completionSchema.parse(data);},
};

/** Existing bridge primitive only; AP-16-06-04B does not add a productive caller. */
export async function deliverPendingWhatsAppMessage(input:{internal_message_id:string}, deps:{store?:DeliveryPersistence;send?:typeof sendWhatsAppText;env?:Partial<NodeJS.ProcessEnv>;createDispatchToken?:()=>string}={}):Promise<{deliveryCommandId:string;status:string}> {
  const messageId=uuid.parse(input.internal_message_id), store=deps.store??persistence, env=deps.env??process.env;
  const claimed=await store.claim(messageId);
  if(claimed.status!=="sending") return {deliveryCommandId:claimed.delivery_command_id,status:claimed.status};
  if(!await store.revalidate(claimed.delivery_command_id,claimed.claim_token)) return {deliveryCommandId:claimed.delivery_command_id,status:"blocked"};
  const accessToken=env.WHATSAPP_ACCESS_TOKEN, phoneNumberId=env.WHATSAPP_PHONE_NUMBER_ID, version=env.WHATSAPP_GRAPH_API_VERSION;
  if(!accessToken||!phoneNumberId||version!==PINNED_WHATSAPP_GRAPH_API_VERSION){
    await store.failPreDispatch(claimed.delivery_command_id,claimed.claim_token);
    return {deliveryCommandId:claimed.delivery_command_id,status:"blocked"};
  }
  const dispatch=await store.authorize(claimed.delivery_command_id,claimed.claim_token,(deps.createDispatchToken??randomUUID)());
  if(dispatch.status!=="authorized") return {deliveryCommandId:claimed.delivery_command_id,status:dispatch.status};
  const result=await (deps.send??sendWhatsAppText)({destination:claimed.destination,text:claimed.text,phoneNumberId,accessToken,graphApiVersion:version});
  try {
    const completion=await store.complete(claimed.delivery_command_id,claimed.claim_token,dispatch,result);
    if(completion.status!=="completed") throw new Error("controlled_completion_failure");
  } catch { throw new Error("delivery_completion_requires_reconciliation"); }
  return {deliveryCommandId:claimed.delivery_command_id,status:result.success?"accepted_by_provider":result.failureCode==="ambiguous_send_result"?"delivery_ambiguous":result.retryClassification==="configuration"?"blocked":"failed"};
}
