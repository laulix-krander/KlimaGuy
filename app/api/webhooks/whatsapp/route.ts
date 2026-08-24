import { createWhatsAppWebhookHandlers } from "@/lib/server/whatsapp/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createWhatsAppWebhookHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
