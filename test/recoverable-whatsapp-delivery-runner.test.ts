import { describe, expect, it, vi } from "vitest";
import { runRecoverableWhatsAppDelivery, type RecoverableWhatsAppDeliveryDependencies } from "@/lib/server/whatsapp/recoverable-delivery-runner";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const acquired = { status: "acquired" as const, delivery_command_id: id(1), outbound_message_id: id(9), execution_owner_id: id(2), execution_lease_expires_at: "2026-09-03T12:01:00.000Z", destination: "491234", text: " Persistierter Text\n", sender_scope: "scope" };
const dispatch = { status: "authorized" as const, delivery_command_id: id(1), attempt_number: 2, dispatch_token: id(3), dispatch_started_at: "2026-09-03T12:00:00.000Z" };
const success = { success: true as const, providerMessageId: "wamid.persisted", acceptedAt: "2026-09-03T12:00:01.000Z" };

function dependencies(overrides: Partial<RecoverableWhatsAppDeliveryDependencies> = {}): RecoverableWhatsAppDeliveryDependencies {
  return {
    acquire: vi.fn().mockResolvedValue(acquired),
    revalidate: vi.fn().mockResolvedValue({ status: "valid" }),
    readConfiguration: vi.fn().mockReturnValue({ accessToken: "secret", phoneNumberId: "phone-id", graphApiVersion: "v25.0" }),
    failPreDispatch: vi.fn().mockResolvedValue({ status: "completed" }),
    authorize: vi.fn().mockResolvedValue(dispatch),
    send: vi.fn().mockResolvedValue(success),
    complete: vi.fn().mockResolvedValue({ status: "completed" }),
    finalizeAmbiguous: vi.fn().mockResolvedValue({ status: "finalized" }),
    createExecutionOwner: () => id(2),
    createDispatchToken: () => id(3),
    ...overrides,
  };
}

describe("AP-16-06-04D recoverable WhatsApp delivery runner", () => {
  it("acquires first and sends authoritative context exactly once after revalidation and authorization", async () => {
    const order: string[] = [];
    const deps = dependencies({
      acquire: vi.fn(async (messageId, owner) => { order.push("acquire"); expect(messageId).toBe(id(9)); expect(owner).toBe(id(2)); return acquired; }),
      revalidate: vi.fn(async () => { order.push("revalidate"); return { status: "valid" as const }; }),
      readConfiguration: vi.fn(() => { order.push("configuration"); return { accessToken: "secret", phoneNumberId: "phone-id", graphApiVersion: "v25.0" }; }),
      authorize: vi.fn(async () => { order.push("authorize"); return dispatch; }),
      send: vi.fn(async (input) => { order.push("send"); expect(input).toEqual({ destination: acquired.destination, text: acquired.text, phoneNumberId: "phone-id", accessToken: "secret", graphApiVersion: "v25.0" }); return success; }),
      complete: vi.fn(async (command, owner, authorized, result) => { order.push("complete"); expect([command, owner]).toEqual([id(1), id(2)]); expect(authorized).toEqual(dispatch); expect(result).toEqual(success); return { status: "completed" as const }; }),
    });
    expect(await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps)).toEqual({ status: "sent" });
    expect(order).toEqual(["acquire", "revalidate", "configuration", "authorize", "send", "complete"]);
    expect(deps.send).toHaveBeenCalledOnce();
  });

  it.each(["busy", "not_due", "already_terminal", "retry_not_allowed", "attempts_exhausted", "ambiguous"] as const)("maps acquire %s without further work", async (status) => {
    const deps = dependencies({ acquire: vi.fn().mockResolvedValue({ status, delivery_command_id: id(1) }) });
    expect((await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps)).status).toBe(status);
    expect(deps.revalidate).not.toHaveBeenCalled(); expect(deps.authorize).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });

  it("uses pre-dispatch failure authority for invalid configuration without an attempt", async () => {
    const deps = dependencies({ readConfiguration: () => ({}), failPreDispatch: vi.fn().mockResolvedValue({ status: "completed" }) });
    expect(await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps)).toEqual({ status: "terminal_failed" });
    expect(deps.failPreDispatch).toHaveBeenCalledWith(id(1), id(2)); expect(deps.authorize).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });

  it.each(["ownership_lost", "blocked", "not_authorized"] as const)("stops on revalidation %s", async (status) => {
    const deps = dependencies({ revalidate: vi.fn().mockResolvedValue({ status }) });
    const result = await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps);
    expect(result.status).toBe(status === "ownership_lost" ? "ownership_lost" : status === "blocked" ? "terminal_failed" : "failed"); expect(deps.send).not.toHaveBeenCalled();
  });

  it.each([["already_authorized", "ambiguous"], ["attempts_exhausted", "attempts_exhausted"], ["ownership_lost", "ownership_lost"], ["not_authorized", "failed"]] as const)("maps dispatch %s without a provider call", async (status, expected) => {
    const deps = dependencies({ authorize: vi.fn().mockResolvedValue({ status }) });
    expect((await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps)).status).toBe(expected); expect(deps.send).not.toHaveBeenCalled();
  });

  it.each([
    [{ success: false, failureCode: "transient_provider_error", retryClassification: "retryable", providerSafeCode: "503" }, "retry_scheduled"],
    [{ success: false, failureCode: "rate_limited", retryClassification: "retryable", providerSafeCode: "429" }, "retry_scheduled"],
    [{ success: false, failureCode: "provider_rejected", retryClassification: "terminal", providerSafeCode: "400" }, "terminal_failed"],
    [{ success: false, failureCode: "ambiguous_send_result", retryClassification: "requires_reconciliation", providerSafeCode: null }, "ambiguous"],
  ] as const)("completes controlled provider result as %s", async (providerResult, expected) => {
    const deps = dependencies({ send: vi.fn().mockResolvedValue(providerResult) });
    expect((await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps)).status).toBe(expected); expect(deps.send).toHaveBeenCalledOnce(); expect(deps.complete).toHaveBeenCalledOnce();
  });

  it.each(["ownership_lost", "binding_conflict"] as const)("never resends after success when completion returns %s", async (status) => {
    const deps = dependencies({ complete: vi.fn().mockResolvedValue({ status }) });
    expect((await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, deps)).status).toBe(status === "ownership_lost" ? "ownership_lost" : "ambiguous"); expect(deps.send).toHaveBeenCalledOnce();
  });

  it("fails closed and data-minimized for exceptions before and after dispatch", async () => {
    const before = dependencies({ acquire: vi.fn().mockRejectedValue(new Error("secret phone text")) });
    expect(await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, before)).toEqual({ status: "failed" }); expect(before.send).not.toHaveBeenCalled();
    const after = dependencies({ send: vi.fn().mockRejectedValue(new Error("secret provider payload")) });
    const result = await runRecoverableWhatsAppDelivery({ outbound_message_id: id(9) }, after);
    expect(result).toEqual({ status: "ambiguous" }); expect(after.send).toHaveBeenCalledOnce(); expect(JSON.stringify(result)).not.toMatch(/secret|491234|Persistierter|provider payload/);
  });

  it("FINALIZE_AMBIGUOUS only invokes recovery finalization", async () => {
    const deps = dependencies();
    expect(await runRecoverableWhatsAppDelivery({ recovery_action: "FINALIZE_AMBIGUOUS", delivery_command_id: id(1) }, deps)).toEqual({ status: "ambiguous" });
    expect(deps.finalizeAmbiguous).toHaveBeenCalledWith(id(1)); expect(deps.acquire).not.toHaveBeenCalled(); expect(deps.authorize).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
});
