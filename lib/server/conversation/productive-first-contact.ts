import "server-only";

import { runFirstContactFoundation } from "./first-contact-foundation-adapter";
import { runFirstContactInitialPrompt } from "./first-contact-initial-prompt-adapter";
import type { FirstContactFoundationResult } from "./first-contact-foundation";
import type { InitialPromptResult } from "./first-contact-initial-prompt";
import { IMMEDIATE_DELIVERY_MINIMUM_REMAINING_MS, WHATSAPP_WEBHOOK_RUNTIME_MS } from "@/lib/server/whatsapp/ingestion";
import { createProductiveRecoverableWhatsAppDeliveryDependencies } from "@/lib/server/whatsapp/outbound-delivery";
import { runRecoverableWhatsAppDelivery } from "@/lib/server/whatsapp/recoverable-delivery-runner";

export type ProductiveFirstContactResult =
  | { status: "completed" | "already_complete"; outbound_message_id: string; delivery: "started" | "deferred" | "not_requested" }
  | { status: "not_applicable" | "stale" | "failed" };

type Dependencies = Readonly<{
  foundation?: (conversationId: string) => Promise<FirstContactFoundationResult>;
  initializePrompt?: (conversationId: string) => Promise<InitialPromptResult>;
  deliver?: typeof runRecoverableWhatsAppDelivery;
  createDeliveryDependencies?: typeof createProductiveRecoverableWhatsAppDeliveryDependencies;
  now?: () => number;
}>;

/** Composes only the 05D, 05E and existing delivery authorities. */
export async function runProductiveFirstContactInitialization(
  input: Readonly<{ conversation_id: string; request_started_at?: number; immediate_delivery?: boolean }>,
  dependencies: Dependencies = {},
): Promise<ProductiveFirstContactResult> {
  let foundation: FirstContactFoundationResult;
  try { foundation = await (dependencies.foundation ?? runFirstContactFoundation)(input.conversation_id); }
  catch { return { status: "failed" }; }
  if (!["created", "partial_completed", "already_complete"].includes(foundation.status)) return { status: "failed" };

  let prompt: InitialPromptResult;
  try { prompt = await (dependencies.initializePrompt ?? runFirstContactInitialPrompt)(input.conversation_id); }
  catch { return { status: "failed" }; }
  if (prompt.status === "stale") return { status: "stale" };
  if (prompt.status === "already_advanced" || prompt.status === "not_applicable") return { status: "not_applicable" };
  if (prompt.status !== "initialized" && prompt.status !== "already_initialized") return { status: "failed" };

  const status = prompt.status === "initialized" ? "completed" : "already_complete";
  if (input.immediate_delivery !== true) return { status, outbound_message_id: prompt.outbound_message_id, delivery: "not_requested" };
  const now = dependencies.now ?? (() => performance.now());
  const startedAt = input.request_started_at ?? now();
  if (WHATSAPP_WEBHOOK_RUNTIME_MS - (now() - startedAt) < IMMEDIATE_DELIVERY_MINIMUM_REMAINING_MS) {
    return { status, outbound_message_id: prompt.outbound_message_id, delivery: "deferred" };
  }
  try {
    await (dependencies.deliver ?? runRecoverableWhatsAppDelivery)(
      { outbound_message_id: prompt.outbound_message_id },
      (dependencies.createDeliveryDependencies ?? createProductiveRecoverableWhatsAppDeliveryDependencies)(),
    );
  } catch {
    return { status, outbound_message_id: prompt.outbound_message_id, delivery: "deferred" };
  }
  return { status, outbound_message_id: prompt.outbound_message_id, delivery: "started" };
}
