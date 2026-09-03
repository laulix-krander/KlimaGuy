import { createWhatsAppWebhookHandlers } from "@/lib/server/whatsapp/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handlers = createWhatsAppWebhookHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
