import { createFirstContactRecoveryHandler } from "@/lib/server/conversation/first-contact-recovery-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = createFirstContactRecoveryHandler();
