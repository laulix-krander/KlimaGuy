import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { commitTestCustomerReset } from "@/lib/actions/test-customer-reset";
import { operateTestCustomerReset, type TestCustomerResetSource } from "@/lib/actions/test-customer-reset-service";

const lifecycle = {
  identity_id: "00000000-0000-4000-8000-000000000001", customer_id: "00000000-0000-4000-8000-000000000002",
  binding_id: "00000000-0000-4000-8000-000000000003", binding_revision: 4,
  conversation_id: "00000000-0000-4000-8000-000000000004", conversation_revision: 8,
  conversation_status: "open" as const, project_id: "00000000-0000-4000-8000-000000000005",
};
const closedLifecycle = { ...lifecycle, conversation_revision: 9, conversation_status: "closed" as const };
const identity = { sender_scope: "scope-1", external_identity: "identity-1" };

const actionAdapter = vi.hoisted(() => ({
  resolve: vi.fn(), close: vi.fn(), issue: vi.fn(async () => "signed-preview"), verify: vi.fn(async () => true),
}));
vi.mock("@/lib/server/test-customer-reset-adapter", () => ({
  resolveTestCustomerLifecycle: actionAdapter.resolve,
  closeTestCustomerConversation: actionAdapter.close,
  issueTestResetPreviewReceipt: actionAdapter.issue,
  verifyTestResetPreviewReceipt: actionAdapter.verify,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: "actor" } }, error: null })) },
  from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { role: "admin" }, error: null })) })) })) })), rpc: vi.fn(),
})) }));

function source(overrides: Partial<TestCustomerResetSource> = {}): TestCustomerResetSource {
  return {
    getUser: vi.fn(async () => ({ id: "actor" })), getProfile: vi.fn(async () => ({ role: "admin" })),
    resolve: vi.fn(async () => lifecycle), close: vi.fn(async () => closedLifecycle),
    issuePreviewReceipt: vi.fn(async () => "signed-preview"), verifyPreviewReceipt: vi.fn(async () => true), ...overrides,
  };
}

describe("logical test customer reset operator", () => {
  it("rejects anonymous and non-admin callers before resolving PII", async () => {
    const anonymous = source({ getUser: vi.fn(async () => null) });
    expect(await operateTestCustomerReset(identity, "preview", anonymous)).toMatchObject({ success: false, code: "not_authenticated" });
    expect(anonymous.resolve).not.toHaveBeenCalled();
    const reviewer = source({ getProfile: vi.fn(async () => ({ role: "reviewer" })) });
    expect(await operateTestCustomerReset(identity, "preview", reviewer)).toMatchObject({ success: false, code: "not_authorized" });
    expect(reviewer.resolve).not.toHaveBeenCalled();
  });

  it("resolves the stable identity and current lifecycle without mutating preview", async () => {
    const adapter = source();
    expect(await operateTestCustomerReset(identity, "preview", adapter)).toEqual({ success: true, phase: "preview", lifecycle, preview_receipt: "signed-preview" });
    expect(adapter.resolve).toHaveBeenCalledWith(identity);
    expect(adapter.close).not.toHaveBeenCalled();
    expect(adapter.issuePreviewReceipt).toHaveBeenCalledWith(lifecycle);
  });

  it("closes exactly the previewed Conversation through the supported authority", async () => {
    const adapter = source();
    expect(await operateTestCustomerReset(identity, "commit", adapter, "signed-preview")).toEqual({ success: true, phase: "commit", lifecycle: closedLifecycle, closed: true });
    expect(adapter.verifyPreviewReceipt).toHaveBeenCalledWith("signed-preview", lifecycle);
    expect(adapter.close).toHaveBeenCalledWith(lifecycle);
  });

  it("rejects a stale preview before it can close a newer Conversation", async () => {
    const newer = { ...lifecycle, binding_id: "00000000-0000-4000-8000-000000000006", binding_revision: 5, conversation_id: "00000000-0000-4000-8000-000000000007", conversation_revision: 1 };
    const adapter = source({ resolve: vi.fn(async () => newer), verifyPreviewReceipt: vi.fn(async () => false) });
    expect(await operateTestCustomerReset(identity, "commit", adapter, "old-preview")).toMatchObject({ success: false, code: "preview_required" });
    expect(adapter.close).not.toHaveBeenCalled();
  });

  it("handles repeated reset with no open Conversation without cleanup", async () => {
    const adapter = source({ resolve: vi.fn(async () => closedLifecycle) });
    expect(await operateTestCustomerReset(identity, "commit", adapter, "signed-preview")).toEqual({ success: true, phase: "commit", lifecycle: closedLifecycle, closed: false });
    expect(adapter.close).not.toHaveBeenCalled();
  });

  it("surfaces a Step-2 close fence rejection instead of bypassing the authority", async () => {
    const adapter = source({ close: vi.fn(async () => { throw new Error("conversation_dispatch_in_progress"); }) });
    expect(await operateTestCustomerReset(identity, "commit", adapter, "signed-preview")).toMatchObject({ success: false, code: "reset_failed" });
    expect(adapter.close).toHaveBeenCalledWith(lifecycle);
  });

  it("retains stable Customer, Identity, Project and history in its result", async () => {
    const result = await operateTestCustomerReset(identity, "commit", source(), "signed-preview");
    expect(result).toMatchObject({ success: true, lifecycle: { identity_id: lifecycle.identity_id, customer_id: lifecycle.customer_id, project_id: lifecycle.project_id } });
    expect(JSON.stringify(result)).not.toMatch(/deleted|messages|receipts/);
  });

  it("keeps the active path off the destructive RPC and delegates lifecycle creation to ingestion", () => {
    const adapter = readFileSync("lib/server/test-customer-reset-adapter.ts", "utf8");
    const service = readFileSync("lib/actions/test-customer-reset-service.ts", "utf8");
    const ui = readFileSync("app/(app)/admin/test-customer-reset/test-customer-reset-operator.tsx", "utf8");
    expect(adapter).toContain('client.rpc("transition_conversation_status"');
    expect(adapter).not.toContain("reset_test_transport_customer");
    expect(service).not.toMatch(/delete|create.*conversation|create.*project/i);
    expect(ui).toContain("gesamte Historie bleibt erhalten");
    expect(ui).toContain("bestehenden Eingangspfad");
  });

  it("passes only the strict identity and current preview to the server action", async () => {
    actionAdapter.resolve.mockResolvedValueOnce(lifecycle);
    actionAdapter.close.mockResolvedValueOnce(closedLifecycle);
    expect(await commitTestCustomerReset({ ...identity, preview_receipt: "signed-preview" })).toMatchObject({ success: true, closed: true });
    expect(actionAdapter.verify).toHaveBeenCalledWith("signed-preview", lifecycle);
    expect(actionAdapter.close).toHaveBeenCalledWith(expect.anything(), lifecycle);
  });
});
