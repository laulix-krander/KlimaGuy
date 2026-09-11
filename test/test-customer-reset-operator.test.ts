import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { commitTestCustomerReset } from "@/lib/actions/test-customer-reset";
import { operateTestCustomerReset, type TestCustomerResetSource } from "@/lib/actions/test-customer-reset-service";

const actionAdapter = vi.hoisted(() => ({
  reset: vi.fn(async ({ dry_run }: { dry_run: boolean }) => ({ ...counts, dry_run })),
  issuePreviewReceipt: vi.fn(async () => "signed-preview"),
  verifyPreviewReceipt: vi.fn(async () => true),
}));

vi.mock("@/lib/server/test-customer-reset-adapter", () => ({
  resetTestTransportCustomer: actionAdapter.reset,
  issueTestResetPreviewReceipt: actionAdapter.issuePreviewReceipt,
  verifyTestResetPreviewReceipt: actionAdapter.verifyPreviewReceipt,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "actor" } }, error: null })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { role: "admin" }, error: null })) })),
      })),
    })),
  })),
}));

const identity = { sender_scope: "scope-1", external_identity: "identity-1" };
const counts = { customers: 1, conversations: 1, projects: 1, messages: 2, runtime_states: 1, pending_interactions: 0, snapshots: 1, cycle_commands: 1, ai_results: 1, answer_contexts: 1, provider_receipts_retained: 2, dry_run: true };
function source(overrides: Partial<TestCustomerResetSource> = {}): TestCustomerResetSource { return { getUser: vi.fn(async () => ({ id: "actor" })), getProfile: vi.fn(async () => ({ role: "admin" })), reset: vi.fn(async ({ dry_run }) => ({ ...counts, dry_run })), issuePreviewReceipt: vi.fn(async () => "signed-preview"), verifyPreviewReceipt: vi.fn(async () => true), ...overrides }; }

describe("safe test customer reset operator", () => {
  it("rejects anonymous and non-admin callers before reset", async () => {
    const anonymous = source({ getUser: vi.fn(async () => null) });
    expect(await operateTestCustomerReset(identity, "preview", anonymous)).toMatchObject({ success: false, code: "not_authenticated" }); expect(anonymous.reset).not.toHaveBeenCalled();
    const reviewer = source({ getProfile: vi.fn(async () => ({ role: "reviewer" })) });
    expect(await operateTestCustomerReset(identity, "preview", reviewer)).toMatchObject({ success: false, code: "not_authorized" }); expect(reviewer.reset).not.toHaveBeenCalled();
  });
  it("runs a validated preview and issues a receipt", async () => { const adapter = source(); expect(await operateTestCustomerReset(identity, "preview", adapter)).toMatchObject({ success: true, phase: "preview", counts, preview_receipt: "signed-preview" }); expect(adapter.reset).toHaveBeenCalledWith({ ...identity, dry_run: true }); });
  it("requires a matching receipt before commit", async () => { const adapter = source({ verifyPreviewReceipt: vi.fn(async () => false) }); expect(await operateTestCustomerReset(identity, "commit", adapter, "wrong")).toMatchObject({ success: false, code: "preview_required" }); expect(adapter.reset).not.toHaveBeenCalled(); });
  it("fails closed when the receipt is missing", async () => { const adapter = source(); expect(await operateTestCustomerReset(identity, "commit", adapter)).toMatchObject({ success: false, code: "preview_required" }); expect(adapter.verifyPreviewReceipt).not.toHaveBeenCalled(); expect(adapter.reset).not.toHaveBeenCalled(); });
  it("commits only after receipt verification", async () => { const adapter = source(); expect(await operateTestCustomerReset(identity, "commit", adapter, "signed-preview")).toMatchObject({ success: true, phase: "commit", counts: { dry_run: false } }); expect(adapter.verifyPreviewReceipt).toHaveBeenCalledWith("signed-preview", identity); expect(adapter.reset).toHaveBeenCalledWith({ ...identity, dry_run: false }); });
  it("separates the preview receipt from the strict identity boundary", async () => {
    actionAdapter.reset.mockClear();
    actionAdapter.verifyPreviewReceipt.mockClear();

    expect(await commitTestCustomerReset({ ...identity, preview_receipt: "signed-preview" })).toMatchObject({ success: true, phase: "commit", counts: { dry_run: false } });
    expect(actionAdapter.verifyPreviewReceipt).toHaveBeenCalledWith("signed-preview", identity);
    expect(actionAdapter.reset).toHaveBeenCalledWith({ ...identity, dry_run: false });
  });
  it("rejects malformed provider results", async () => { const adapter = source({ reset: vi.fn(async () => ({ ...counts, messages: "2" })) }); expect(await operateTestCustomerReset(identity, "preview", adapter)).toMatchObject({ success: false, code: "reset_failed" }); });
  it("fails closed on missing configuration and hides provider errors", async () => { const missing = source({ reset: vi.fn(async () => { throw new Error("test_reset_configuration_missing"); }) }); expect(await operateTestCustomerReset(identity, "preview", missing)).toMatchObject({ success: false, code: "configuration_missing" }); const providerFailure = source({ reset: vi.fn(async () => { throw new Error("raw sensitive provider payload"); }) }); const result = await operateTestCustomerReset(identity, "preview", providerFailure); expect(result).toMatchObject({ success: false, code: "reset_failed" }); expect(JSON.stringify(result)).not.toContain("sensitive"); });
  it("exposes no generic RPC or service-role secret to the client", () => { const adapter = readFileSync("lib/server/test-customer-reset-adapter.ts", "utf8"); const client = readFileSync("app/(app)/admin/test-customer-reset/test-customer-reset-operator.tsx", "utf8"); const action = readFileSync("lib/actions/test-customer-reset.ts", "utf8"); expect(adapter).toContain('rpc("reset_test_transport_customer"'); expect(adapter).toContain('target_provider: "whatsapp"'); expect(adapter).toContain('target_confirmation: "RESET TEST CUSTOMER"'); expect(adapter.match(/\.rpc\(/g)).toHaveLength(1); expect(client).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|@supabase\/supabase-js|lib\/server/); expect(action).not.toMatch(/functionName|rpcName/); });
});
