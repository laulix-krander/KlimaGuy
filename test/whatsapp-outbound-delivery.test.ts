import { readFileSync } from "node:fs";
import { describe,expect,it,vi } from "vitest";
import { PINNED_WHATSAPP_GRAPH_API_VERSION,sendWhatsAppText } from "@/lib/server/whatsapp/outbound-adapter";
import { deliverPendingWhatsAppMessage,type DeliveryPersistence } from "@/lib/server/whatsapp/outbound-delivery";
import { parseWhatsAppWebhook } from "@/lib/server/whatsapp/parser";

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const acquired={delivery_command_id:id(1),outbound_message_id:id(9),execution_owner_id:id(2),execution_lease_expires_at:"2026-09-02T12:01:00.000Z",destination:"491234",text:" Exakt\nso ",sender_scope:"sender-1",status:"acquired" as const};
const dispatch={status:"authorized" as const,delivery_command_id:id(1),attempt_number:1,dispatch_token:id(3),dispatch_started_at:"2026-09-02T12:00:00.000Z"};
const store=(overrides:Partial<DeliveryPersistence>={}):DeliveryPersistence=>({acquire:vi.fn().mockResolvedValue(acquired),revalidate:vi.fn().mockResolvedValue({status:"valid"}),authorize:vi.fn().mockResolvedValue(dispatch),failPreDispatch:vi.fn().mockResolvedValue({status:"completed"}),complete:vi.fn().mockResolvedValue({status:"completed"}),...overrides});

describe("WhatsApp Cloud API outbound adapter",()=>{
  it("uses the pinned endpoint, bearer token, destination and exact text only",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({messaging_product:"whatsapp",contacts:[{wa_id:"491234"}],messages:[{id:"wamid.out"}]}),{status:200,headers:{"content-type":"application/json"}}));
    expect((await sendWhatsAppText({destination:"491234",text:" Exakt\nso ",phoneNumberId:"phone-id",accessToken:"secret",graphApiVersion:PINNED_WHATSAPP_GRAPH_API_VERSION},fetcher)).success).toBe(true);
    const [url,init]=fetcher.mock.calls[0];expect(url).toBe("https://graph.facebook.com/v25.0/phone-id/messages");
    expect(init.headers.authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toEqual({messaging_product:"whatsapp",recipient_type:"individual",to:"491234",type:"text",text:{body:" Exakt\nso "}});
  });
  it.each([[401,"provider_auth_error","configuration"],[403,"provider_auth_error","configuration"],[429,"rate_limited","retryable"],[503,"transient_provider_error","retryable"]])("maps HTTP %s",async(status,code,retry)=>{const result=await sendWhatsAppText({destination:"1",text:"x",phoneNumberId:"p",accessToken:"s",graphApiVersion:"v25.0"},vi.fn().mockResolvedValue(new Response(null,{status})));expect(result).toMatchObject({success:false,failureCode:code,retryClassification:retry});});
  it("marks an indeterminate network result ambiguous",async()=>{const result=await sendWhatsAppText({destination:"1",text:"x",phoneNumberId:"p",accessToken:"s",graphApiVersion:"v25.0"},vi.fn().mockRejectedValue(new Error("timeout")));expect(result).toMatchObject({failureCode:"ambiguous_send_result",retryClassification:"requires_reconciliation"});});
});

describe("controlled delivery orchestration",()=>{
  it("revalidates immediately, completes acceptance, and replays without a send",async()=>{
    const complete=vi.fn().mockResolvedValue({status:"completed"});const deliveryStore=store({complete});const send=vi.fn().mockResolvedValue({success:true,providerMessageId:"wamid.out",acceptedAt:"2026-08-24T12:00:00.000Z"});
    expect(await deliverPendingWhatsAppMessage({internal_message_id:id(9)},{store:deliveryStore,send,createExecutionOwner:()=>id(2),createDispatchToken:()=>id(3),env:{WHATSAPP_ACCESS_TOKEN:"token",WHATSAPP_PHONE_NUMBER_ID:"phone",WHATSAPP_GRAPH_API_VERSION:"v25.0"}})).toMatchObject({status:"accepted_by_provider"});expect(send).toHaveBeenCalledOnce();expect(complete).toHaveBeenCalledOnce();
    deliveryStore.acquire=vi.fn().mockResolvedValue({delivery_command_id:id(1),status:"already_terminal"});expect((await deliverPendingWhatsAppMessage({internal_message_id:id(9)},{store:deliveryStore,send,createExecutionOwner:()=>id(2)})).status).toBe("already_terminal");expect(send).toHaveBeenCalledOnce();
  });
  it("blocks a takeover race before fetch",async()=>{const deliveryStore=store({revalidate:vi.fn().mockResolvedValue({status:"ownership_lost"})});const send=vi.fn();expect((await deliverPendingWhatsAppMessage({internal_message_id:id(9)},{store:deliveryStore,send,createExecutionOwner:()=>id(2)})).status).toBe("ownership_lost");expect(send).not.toHaveBeenCalled();expect(deliveryStore.authorize).not.toHaveBeenCalled();});
  it("fails closed before dispatch when configuration is missing",async()=>{const failPreDispatch=vi.fn().mockResolvedValue({status:"completed"});const deliveryStore=store({failPreDispatch});await deliverPendingWhatsAppMessage({internal_message_id:id(9)},{store:deliveryStore,createExecutionOwner:()=>id(2),env:{}});expect(failPreDispatch).toHaveBeenCalledWith(id(1),id(2));expect(deliveryStore.authorize).not.toHaveBeenCalled();});
});

describe("delivery status and persistence contract",()=>{
  it("parses only controlled status fields",()=>{const payload={object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:"sender-1"},statuses:[{id:"wamid.out",status:"failed",timestamp:"1787572800",recipient_id:"491234",errors:[{code:131026,title:"PII text"}]}]}}]}]};expect(parseWhatsAppWebhook(payload)).toEqual([{kind:"delivery_status",event:{provider:"whatsapp",sender_scope:"sender-1",provider_message_id:"wamid.out",provider_status:"failed",provider_occurred_at:"2026-08-24T12:00:00.000Z",failure_code:"131026"}}]);});
  it("defines RLS, claims, outbound binding, dedupe and monotone reconciliation",()=>{const sql=readFileSync("supabase/migrations/202608240002_whatsapp_outbound_delivery.sql","utf8");for(const table of ["transport_delivery_commands","transport_send_attempts","transport_delivery_events"]){expect(sql).toContain(`create table public.${table}`);expect(sql).toContain(`alter table public.${table} enable row level security`);}expect(sql).toContain("unique(provider,transport_binding_id,internal_message_id)");expect(sql).toContain("direction='outbound'");expect(sql).toContain("d.status not in ('delivered','read')");expect(sql).toContain("status='active'");expect(sql).not.toMatch(/raw_payload\s/);expect(sql).not.toMatch(/alter table public\.conversation_messages add/);});
});
