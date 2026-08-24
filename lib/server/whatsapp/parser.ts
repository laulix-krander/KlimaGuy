import "server-only";

import { whatsappDeliveryStatusSchema, whatsappInboundTextSchema, type WhatsAppParsedEvent } from "./contracts";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const mediaTypes = new Set(["image", "document", "audio", "video", "sticker"]);

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const milliseconds = Number(value) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

/** Tolerant Meta edge parser. Only the strict canonical result crosses this module. */
export function parseWhatsAppWebhook(payload: unknown): WhatsAppParsedEvent[] {
  if (!record(payload) || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return [{ kind: "malformed" }];
  }
  const results: WhatsAppParsedEvent[] = [];
  for (const entry of payload.entry) {
    if (!record(entry) || !Array.isArray(entry.changes)) { results.push({ kind: "malformed" }); continue; }
    for (const change of entry.changes) {
      if (!record(change) || change.field !== "messages" || !record(change.value)) {
        results.push({ kind: "non_message_event" }); continue;
      }
      const metadata = change.value.metadata;
      const scope = record(metadata) && typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : null;
      const messages = change.value.messages;
      const statuses = change.value.statuses;
      if (Array.isArray(statuses) && scope) for (const status of statuses) {
        const errors=record(status)&&Array.isArray(status.errors)?status.errors:[]; const first=errors[0];
        const candidate={provider:"whatsapp",sender_scope:scope,provider_message_id:record(status)?status.id:undefined,provider_status:record(status)?status.status:undefined,provider_occurred_at:timestamp(record(status)?status.timestamp:null),failure_code:record(first)&&typeof first.code==="number"?String(first.code):null};
        const parsed=whatsappDeliveryStatusSchema.safeParse(candidate);
        results.push(parsed.success?{kind:"delivery_status",event:parsed.data}:{kind:"malformed"});
      }
      if (!Array.isArray(messages)) {
        if(!Array.isArray(statuses)) results.push({kind:"malformed"}); continue;
      }
      for (const message of messages) {
        if (!record(message) || !scope || typeof message.type !== "string") { results.push({ kind: "malformed" }); continue; }
        if (mediaTypes.has(message.type)) {
          results.push({ kind: "media_deferred", media_type: message.type as "image" | "document" | "audio" | "video" | "sticker" }); continue;
        }
        if (message.type !== "text") { results.push({ kind: "unsupported_message_type", message_type: message.type }); continue; }
        const occurredAt = timestamp(message.timestamp);
        const text = message.text;
        const candidate = {
          provider: "whatsapp", provider_message_id: message.id,
          external_sender_identity: message.from, sender_scope: scope,
          provider_occurred_at: occurredAt, message_type: "text",
          text: record(text) ? text.body : undefined,
        };
        const parsed = whatsappInboundTextSchema.safeParse(candidate);
        results.push(parsed.success ? { kind: "inbound_text", event: parsed.data } : { kind: "malformed" });
      }
    }
  }
  return results.length === 0 ? [{ kind: "non_message_event" }] : results;
}
