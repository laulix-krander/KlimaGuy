import { createWhatsAppDeliveryRecoveryHandler } from "@/lib/server/whatsapp/delivery-recovery-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = createWhatsAppDeliveryRecoveryHandler();
