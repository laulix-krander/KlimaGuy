import "server-only";

import { runFirstContactFoundation } from "./first-contact-foundation-adapter";
import { runFirstContactInitialPrompt } from "./first-contact-initial-prompt-adapter";
import type { FirstContactFoundationResult } from "./first-contact-foundation";
import type { FirstContactDiagnostic, InitialPromptResult } from "./first-contact-initial-prompt";
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

type OrchestratorDiagnostic =
  | FirstContactDiagnostic
  | { diagnostic_code: "foundation_exception"; stage: "foundation" }
  | { diagnostic_code: "foundation_result_rejected"; stage: "foundation"; result_code: "conflict" | "actor_unavailable" | "actor_invalid" | "invalid_state" | "persistence_failure" }
  | { diagnostic_code: "unexpected_error"; stage: "orchestration" };

const logFailure = (diagnostic: OrchestratorDiagnostic) => {
  console.error("first_contact_initialization_failed", diagnostic);
};

/** Composes only the 05D, 05E and existing delivery authorities. */
export async function runProductiveFirstContactInitialization(
  input: Readonly<{ conversation_id: string; request_started_at?: number; immediate_delivery?: boolean }>,
  dependencies: Dependencies = {},
): Promise<ProductiveFirstContactResult> {
  let foundation: FirstContactFoundationResult;
  try { foundation = await (dependencies.foundation ?? runFirstContactFoundation)(input.conversation_id); }
  catch { logFailure({ diagnostic_code: "foundation_exception", stage: "foundation" }); return { status: "failed" }; }
  if (foundation.status !== "created" && foundation.status !== "partial_completed" && foundation.status !== "already_complete") {
    logFailure({ diagnostic_code: "foundation_result_rejected", stage: "foundation", result_code: foundation.status });
    return { status: "failed" };
  }

  let prompt: InitialPromptResult;
  try { prompt = await (dependencies.initializePrompt ?? runFirstContactInitialPrompt)(input.conversation_id); }
  catch { logFailure({ diagnostic_code: "unexpected_error", stage: "orchestration" }); return { status: "failed" }; }
  if (prompt.status === "stale") return { status: "stale" };
  if (prompt.status === "already_advanced" || prompt.status === "not_applicable") return { status: "not_applicable" };
  if ("diagnostic" in prompt) {
    logFailure(prompt.diagnostic);
    return { status: "failed" };
  }
  if (!("outbound_message_id" in prompt)) {
    logFailure({ diagnostic_code: "unexpected_error", stage: "orchestration" });
    return { status: "failed" };
  }

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
