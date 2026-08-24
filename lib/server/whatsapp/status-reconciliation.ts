import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { WhatsAppDeliveryStatus } from "./contracts";

export async function reconcileWhatsAppDeliveryStatus(event:WhatsAppDeliveryStatus):Promise<void>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("configuration_error");
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {error}=await db.rpc("reconcile_whatsapp_delivery_status",{target_sender_scope:event.sender_scope,target_provider_message_id:event.provider_message_id,target_provider_status:event.provider_status,target_occurred_at:event.provider_occurred_at,target_failure_code:event.failure_code});
  if(error) throw new Error("delivery_reconciliation_failed");
}
