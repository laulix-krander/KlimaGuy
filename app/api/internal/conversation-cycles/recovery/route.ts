import { createConversationCycleRecoveryHandler } from "@/lib/server/conversation/recovery-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = createConversationCycleRecoveryHandler();
