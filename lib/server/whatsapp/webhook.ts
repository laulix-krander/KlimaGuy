import "server-only";

import { parseWhatsAppWebhook } from "./parser";
import { verifyWhatsAppChallenge, verifyWhatsAppSignature } from "./security";
import { persistWhatsAppInboundText, triggerPersistentMessageCycle, type MessageCycleTrigger, type WhatsAppInboundPersistence } from "./ingestion";
import { reconcileWhatsAppDeliveryStatus } from "./status-reconciliation";
import { readProductiveFirstContactEligibility, type FirstContactEligibilityResult } from "@/lib/server/conversation/first-contact-eligibility";
import { runProductiveFirstContactInitialization } from "@/lib/server/conversation/productive-first-contact";
import { resolveProductiveConversationEngine, type ConversationEngineResolver } from "@/lib/server/conversation/conversation-engine-routing";
import { dispatchMvpConversation, type MvpConversationDispatch } from "@/lib/server/conversation/mvp-conversation-dispatch";
import { persistWhatsAppInboundImage, runWhatsAppImageIngestion, type WhatsAppImagePersistence } from "./media-ingestion";

/** Internal security ceiling, not a claimed Meta provider limit. */
export const WHATSAPP_WEBHOOK_MAX_BYTES = 1_048_576;

const SAFE_MVP_DISPATCH_ERROR_CODES = new Set([
  "mvp_first_contact_foundation_failed",
  "mvp_turn_configuration_failed",
  "mvp_turn_persistence_failed",
  "mvp_turn_media_invalid",
  "mvp_turn_stale",
  "mvp_turn_provider_failed",
  "mvp_turn_invalid_provider_output",
  "mvp_turn_commit_failed",
]);

function logMvpDispatchFailure(error: unknown): void {
  const code = error instanceof Error && SAFE_MVP_DISPATCH_ERROR_CODES.has(error.message)
    ? error.message
    : "mvp_dispatch_failed";
  console.error("mvp_dispatch_failed", { operation: "dispatch_mvp_conversation", code });
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > WHATSAPP_WEBHOOK_MAX_BYTES)) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > WHATSAPP_WEBHOOK_MAX_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export function createWhatsAppWebhookHandlers(dependencies: {
  persist?: WhatsAppInboundPersistence;
  triggerCycle?: MessageCycleTrigger;
  verifyToken?: () => string | undefined;
  appSecret?: () => string | undefined;
  reconcileStatus?: (event: import("./contracts").WhatsAppDeliveryStatus) => Promise<void>;
  firstContactEligibility?: (conversationId: string) => Promise<FirstContactEligibilityResult>;
  initializeFirstContact?: typeof runProductiveFirstContactInitialization;
  resolveEngine?: ConversationEngineResolver;
  dispatchMvp?: MvpConversationDispatch;
  persistImage?: WhatsAppImagePersistence;
  ingestImage?: typeof runWhatsAppImageIngestion;
} = {}) {
  const persist = dependencies.persist ?? persistWhatsAppInboundText;
  const triggerCycle = dependencies.triggerCycle ?? triggerPersistentMessageCycle;
  const verifyToken = dependencies.verifyToken ?? (() => process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  const appSecret = dependencies.appSecret ?? (() => process.env.WHATSAPP_META_APP_SECRET);
  const reconcileStatus=dependencies.reconcileStatus??reconcileWhatsAppDeliveryStatus;
  const firstContactEligibility = dependencies.firstContactEligibility ?? readProductiveFirstContactEligibility;
  const initializeFirstContact = dependencies.initializeFirstContact ?? runProductiveFirstContactInitialization;
  const resolveEngine = dependencies.resolveEngine ?? resolveProductiveConversationEngine;
  const dispatchMvp = dependencies.dispatchMvp ?? dispatchMvpConversation;
  const persistImage=dependencies.persistImage??persistWhatsAppInboundImage;
  const ingestImage=dependencies.ingestImage??runWhatsAppImageIngestion;
  return {
    GET: async (request: Request): Promise<Response> => {
      const configured = verifyToken();
      if (!configured) return new Response(null, { status: 503 });
      const url = new URL(request.url);
      const challenge = url.searchParams.get("hub.challenge");
      if (!challenge || !verifyWhatsAppChallenge(url.searchParams.get("hub.mode"), url.searchParams.get("hub.verify_token"), configured)) {
        return new Response(null, { status: 403 });
      }
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    },
    POST: async (request: Request): Promise<Response> => {
      const requestStartedAt = performance.now();
      const secret = appSecret();
      if (!secret) return new Response(null, { status: 503 });
      const body = await readBoundedBody(request);
      if (!body) return new Response(null, { status: 413 });
      const authenticity = verifyWhatsAppSignature(body, request.headers.get("x-hub-signature-256"), secret);
      if (authenticity !== "valid") return new Response(null, { status: 401 });
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
      catch { return new Response(null, { status: 400 }); }
      const parsed = parseWhatsAppWebhook(payload);
      if (parsed.some((event) => event.kind === "malformed")) return new Response(null, { status: 400 });
      try {
        for (const item of parsed) {
          if(item.kind==="inbound_image"){
            const result=await persistImage(item.event);
            if(result.status==="duplicate")continue;
            // Reuse the current First Contact authority to create Project N when the image starts a lifecycle.
            try {
              const eligibility=await firstContactEligibility(result.conversation_id);
              if(eligibility.status==="healable"||eligibility.status==="already_initialized")await initializeFirstContact({conversation_id:result.conversation_id,request_started_at:requestStartedAt,immediate_delivery:true});
              const ingestion=await ingestImage({commandId:result.ingestion_command_id});
              if(ingestion.kind==="completed") {
                const ownership=await resolveEngine({conversation_id:result.conversation_id,provider:item.event.provider,sender_scope:item.event.sender_scope,external_identity:item.event.external_sender_identity});
                if(ownership.engine_owner==="mvp") {
                  try { await dispatchMvp({conversation_id:result.conversation_id,message_id:result.internal_message_id,first_contact:false}); }
                  catch (error) { logMvpDispatchFailure(error); }
                }
              }
            } catch { /* Receipt, message and pending command remain durable for bounded recovery. */ }
            continue;
          }
          if (item.kind !== "inbound_text") continue;
          const result = await persist(item.event);
          // Dedupe is authoritative: duplicates never resolve or invoke an engine.
          if (result.status === "duplicate") continue;
          const ownership = await resolveEngine({
            conversation_id: result.conversation_id,
            provider: item.event.provider,
            sender_scope: item.event.sender_scope,
            external_identity: item.event.external_sender_identity,
          });
          if (ownership.engine_owner === "mvp") {
            try { await dispatchMvp({ conversation_id: result.conversation_id, message_id: result.internal_message_id, first_contact: !result.cycle_eligible }); }
            catch (error) { logMvpDispatchFailure(error); }
          } else if (result.cycle_eligible) {
            try { await triggerCycle({ message_id: result.internal_message_id, request_started_at: requestStartedAt }); } catch { /* Persistence is final; recovery owns later work. */ }
          } else {
            try {
              const eligibility = await firstContactEligibility(result.conversation_id);
              if (eligibility.status === "healable" || eligibility.status === "already_initialized") {
                await initializeFirstContact({ conversation_id: result.conversation_id, request_started_at: requestStartedAt, immediate_delivery: true });
              }
            } catch { /* Persisted inbound acceptance is isolated from initialization and delivery. */ }
          }
        }
        for(const item of parsed) if(item.kind==="delivery_status") await reconcileStatus(item.event);
      } catch (error) {
        const code = error instanceof Error && [
          "message_persistence_failed",
          "conversation_engine_resolution_failed",
          "conversation_engine_configuration_error",
        ].includes(error.message) ? error.message : "whatsapp_webhook_processing_failed";
        console.error("whatsapp_webhook_failed", { operation: "process_authenticated_webhook", code });
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 200 });
    },
  };
}
