import "server-only";

import { z } from "zod";

export const whatsappInboundTextSchema = z.object({
  provider: z.literal("whatsapp"),
  provider_message_id: z.string().min(1).max(512),
  external_sender_identity: z.string().min(1).max(255),
  sender_scope: z.string().min(1).max(255),
  provider_occurred_at: z.string().datetime({ offset: true }),
  message_type: z.literal("text"),
  text: z.string().min(1).max(20_000),
}).strict();

export type WhatsAppInboundText = z.infer<typeof whatsappInboundTextSchema>;
export type WhatsAppParsedEvent =
  | { kind: "inbound_text"; event: WhatsAppInboundText }
  | { kind: "delivery_status"; event: WhatsAppDeliveryStatus }
  | { kind: "media_deferred"; media_type: "image" | "document" | "audio" | "video" | "sticker" }
  | { kind: "unsupported_message_type"; message_type: string }
  | { kind: "non_message_event" }
  | { kind: "malformed" };

export const whatsappDeliveryStatusSchema=z.object({provider:z.literal("whatsapp"),sender_scope:z.string().min(1).max(255),provider_message_id:z.string().min(1).max(512),provider_status:z.enum(["sent","delivered","read","failed"]),provider_occurred_at:z.string().datetime({offset:true}),failure_code:z.string().regex(/^\d{1,12}$/).nullable()}).strict();
export type WhatsAppDeliveryStatus=z.infer<typeof whatsappDeliveryStatusSchema>;
