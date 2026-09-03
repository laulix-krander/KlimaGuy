import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WhatsAppSendResult } from "./outbound-adapter";

const uuid = z.string().uuid();

export type RecoverableWhatsAppDeliveryResult =
  | { status: "sent" }
  | { status: "retry_scheduled" }
  | { status: "terminal_failed" }
  | { status: "ambiguous" }
  | { status: "busy" }
  | { status: "not_due" }
  | { status: "already_terminal" }
  | { status: "retry_not_allowed" }
  | { status: "attempts_exhausted" }
  | { status: "ownership_lost" }
  | { status: "failed" };

export type RecoverableWhatsAppDeliveryWork =
  | { recovery_action?: "SAFE_TO_RUN"; outbound_message_id: string }
  | { recovery_action: "FINALIZE_AMBIGUOUS"; delivery_command_id: string };

type Acquired = {
  status: "acquired";
  delivery_command_id: string;
  outbound_message_id: string;
  execution_owner_id: string;
  execution_lease_expires_at: string;
  destination: string;
  text: string;
  sender_scope: string;
};
type AcquireResult = Acquired | { status: "busy" | "already_terminal" | "not_due" | "retry_not_allowed" | "ambiguous" | "attempts_exhausted"; delivery_command_id: string } | { status: "not_sendable" | "not_authorized" | "invalid_request" };
type Dispatch = { status: "authorized"; delivery_command_id: string; attempt_number: number; dispatch_token: string; dispatch_started_at: string };
type CompletionStatus = { status: "completed" | "ownership_lost" | "stale_attempt" | "invalid_result" | "binding_conflict" | "not_authorized" };

export type RecoverableWhatsAppDeliveryDependencies = {
  acquire(outboundMessageId: string, ownerId: string): Promise<AcquireResult>;
  revalidate(commandId: string, ownerId: string): Promise<{ status: "valid" | "blocked" | "ownership_lost" | "not_authorized" }>;
  readConfiguration(): { accessToken?: string; phoneNumberId?: string; graphApiVersion?: string };
  failPreDispatch(commandId: string, ownerId: string): Promise<{ status: "completed" | "ownership_lost" | "dispatch_possible" | "invalid_result" | "not_authorized" }>;
  authorize(commandId: string, ownerId: string, dispatchToken: string): Promise<Dispatch | { status: "already_authorized" | "attempts_exhausted" | "ownership_lost" | "not_authorized" }>;
  send(input: { destination: string; text: string; phoneNumberId: string; accessToken: string; graphApiVersion: "v25.0" }): Promise<WhatsAppSendResult>;
  complete(commandId: string, ownerId: string, dispatch: Dispatch, result: WhatsAppSendResult): Promise<CompletionStatus>;
  finalizeAmbiguous(commandId: string): Promise<{ status: "finalized" | "safe_to_run" | "busy" | "already_terminal" | "provider_binding_exists" | "not_eligible" | "inconsistent_attempt" | "not_authorized" }>;
  createExecutionOwner?: () => string;
  createDispatchToken?: () => string;
};

const closedAcquireResult = (status: AcquireResult["status"]): RecoverableWhatsAppDeliveryResult => {
  if (status === "ambiguous") return { status: "ambiguous" };
  if (status === "busy" || status === "not_due" || status === "already_terminal" || status === "retry_not_allowed" || status === "attempts_exhausted") return { status };
  return { status: "failed" };
};

/** Executes one persisted delivery work item, with at most one provider call. */
export async function runRecoverableWhatsAppDelivery(work: RecoverableWhatsAppDeliveryWork, deps: RecoverableWhatsAppDeliveryDependencies): Promise<RecoverableWhatsAppDeliveryResult> {
  if (work.recovery_action === "FINALIZE_AMBIGUOUS") {
    try {
      const finalized = await deps.finalizeAmbiguous(uuid.parse(work.delivery_command_id));
      if (finalized.status === "finalized") return { status: "ambiguous" };
      if (finalized.status === "busy") return { status: "busy" };
      if (finalized.status === "already_terminal" || finalized.status === "provider_binding_exists") return { status: "already_terminal" };
      return { status: "failed" };
    } catch {
      return { status: "failed" };
    }
  }

  let dispatchStarted = false;
  try {
    const ownerId = uuid.parse((deps.createExecutionOwner ?? randomUUID)());
    const acquired = await deps.acquire(uuid.parse(work.outbound_message_id), ownerId);
    if (acquired.status !== "acquired") return closedAcquireResult(acquired.status);

    const revalidation = await deps.revalidate(acquired.delivery_command_id, ownerId);
    if (revalidation.status === "ownership_lost") return { status: "ownership_lost" };
    if (revalidation.status === "blocked") return { status: "terminal_failed" };
    if (revalidation.status !== "valid") return { status: "failed" };

    const configuration = deps.readConfiguration();
    if (!configuration.accessToken || !configuration.phoneNumberId || configuration.graphApiVersion !== "v25.0") {
      const failure = await deps.failPreDispatch(acquired.delivery_command_id, ownerId);
      if (failure.status === "ownership_lost") return { status: "ownership_lost" };
      if (failure.status === "dispatch_possible") return { status: "ambiguous" };
      return { status: failure.status === "completed" ? "terminal_failed" : "failed" };
    }

    const dispatch = await deps.authorize(acquired.delivery_command_id, ownerId, uuid.parse((deps.createDispatchToken ?? randomUUID)()));
    if (dispatch.status === "ownership_lost") return { status: "ownership_lost" };
    if (dispatch.status === "attempts_exhausted") return { status: "attempts_exhausted" };
    if (dispatch.status === "already_authorized") return { status: "ambiguous" };
    if (dispatch.status !== "authorized") return { status: "failed" };
    dispatchStarted = true;

    const providerResult = await deps.send({ destination: acquired.destination, text: acquired.text, phoneNumberId: configuration.phoneNumberId, accessToken: configuration.accessToken, graphApiVersion: "v25.0" });
    const completion = await deps.complete(acquired.delivery_command_id, ownerId, dispatch, providerResult);
    if (completion.status === "ownership_lost") return { status: "ownership_lost" };
    if (completion.status !== "completed") return { status: "ambiguous" };
    if (providerResult.success) return { status: "sent" };
    if (providerResult.retryClassification === "requires_reconciliation") return { status: "ambiguous" };
    if (providerResult.retryClassification === "retryable") return { status: "retry_scheduled" };
    return { status: "terminal_failed" };
  } catch {
    return { status: dispatchStarted ? "ambiguous" : "failed" };
  }
}
