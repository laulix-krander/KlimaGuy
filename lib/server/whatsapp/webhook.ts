import "server-only";

import { parseWhatsAppWebhook } from "./parser";
import { verifyWhatsAppChallenge, verifyWhatsAppSignature } from "./security";
import { persistWhatsAppInboundText, triggerPersistentMessageCycle, type MessageCycleTrigger, type WhatsAppInboundPersistence } from "./ingestion";
import { reconcileWhatsAppDeliveryStatus } from "./status-reconciliation";
import { readProductiveFirstContactEligibility, type FirstContactEligibilityResult } from "@/lib/server/conversation/first-contact-eligibility";
import { runProductiveFirstContactInitialization } from "@/lib/server/conversation/productive-first-contact";

/** Internal security ceiling, not a claimed Meta provider limit. */
export const WHATSAPP_WEBHOOK_MAX_BYTES = 1_048_576;

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
} = {}) {
  const persist = dependencies.persist ?? persistWhatsAppInboundText;
  const triggerCycle = dependencies.triggerCycle ?? triggerPersistentMessageCycle;
  const verifyToken = dependencies.verifyToken ?? (() => process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  const appSecret = dependencies.appSecret ?? (() => process.env.WHATSAPP_META_APP_SECRET);
  const reconcileStatus=dependencies.reconcileStatus??reconcileWhatsAppDeliveryStatus;
  const firstContactEligibility = dependencies.firstContactEligibility ?? readProductiveFirstContactEligibility;
  const initializeFirstContact = dependencies.initializeFirstContact ?? runProductiveFirstContactInitialization;
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
          if (item.kind !== "inbound_text") continue;
          const result = await persist(item.event);
          // Route once from the persistence result. Never re-evaluate this message after initialization.
          if (result.status === "recorded" && result.cycle_eligible) {
            try { await triggerCycle({ message_id: result.internal_message_id, request_started_at: requestStartedAt }); } catch { /* Persistence is final; recovery owns later work. */ }
          } else if (!result.cycle_eligible) {
            try {
              const eligibility = await firstContactEligibility(result.conversation_id);
              if (eligibility.status === "healable" || eligibility.status === "already_initialized") {
                await initializeFirstContact({ conversation_id: result.conversation_id, request_started_at: requestStartedAt, immediate_delivery: true });
              }
            } catch { /* Persisted inbound acceptance is isolated from initialization and delivery. */ }
          }
        }
        for(const item of parsed) if(item.kind==="delivery_status") await reconcileStatus(item.event);
      } catch { return new Response(null, { status: 500 }); }
      return new Response(null, { status: 200 });
    },
  };
}
