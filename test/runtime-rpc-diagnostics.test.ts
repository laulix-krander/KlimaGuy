import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConversationEngine } from "@/lib/server/conversation/conversation-engine-routing";
import { discoverRecoverableFirstContacts } from "@/lib/server/conversation/first-contact-recovery";
import { classifyRuntimeRpcError } from "@/lib/server/conversation/runtime-rpc-diagnostics";
import { discoverRecoverableWhatsAppDeliveries } from "@/lib/server/whatsapp/outbound-delivery";

const uuid = "00000000-0000-4000-8000-000000000001";
const secret = "service-role-secret";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("safe runtime RPC diagnostics", () => {
  it("classifies PostgREST and exact raised exceptions using closed values", () => {
    expect(classifyRuntimeRpcError({ code: "PGRST202", message: "arbitrary" })).toMatchObject({
      safe_rpc_code: "PGRST202",
      safe_rpc_summary: "postgrest_function_not_found_or_stale_schema",
    });
    expect(classifyRuntimeRpcError({ code: "P0001", message: "not_authorized" })).toMatchObject({
      safe_rpc_code: "P0001",
      safe_rpc_summary: "raised_exception",
      safe_exception: "not_authorized",
    });
  });

  it("never forwards arbitrary error text, details, or hints", () => {
    const diagnostic = classifyRuntimeRpcError({
      code: "XX000", message: `phone 491234567890 ${uuid} ${secret}`,
      details: "private details", hint: "private hint",
    });
    expect(diagnostic).toEqual({
      safe_rpc_code: "XX000",
      safe_rpc_summary: "database_error",
      supabase_host: "invalid_supabase_url",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/491234567890|00000000|service-role|private/);
  });

  it("emits only the Supabase hostname, without key, path, or query", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co/rest/v1?apikey=query-secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", secret);
    const diagnostic = classifyRuntimeRpcError({ code: "42501", message: "denied" });
    expect(diagnostic).toEqual({
      safe_rpc_code: "42501",
      safe_rpc_summary: "insufficient_privilege",
      supabase_host: "project-ref.supabase.co",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/query-secret|service-role-secret|rest\/v1/);
  });

  it("logs safe classifications while retaining all generic adapter errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co/path?key=secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", secret);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "not_authorized", details: uuid, hint: secret } });

    await expect(resolveConversationEngine({ rpc }, { conversation_id: uuid, provider: "whatsapp", sender_scope: "491234567890", external_identity: uuid }))
      .rejects.toThrow("conversation_engine_resolution_failed");
    await expect(discoverRecoverableWhatsAppDeliveries(5, { rpc })).rejects.toThrow("delivery_discovery_failed");
    await expect(discoverRecoverableFirstContacts(10, { rpc })).rejects.toThrow("first_contact_recovery_discovery_failed");

    expect(consoleError.mock.calls.map(([event, fields]) => ({ event, fields }))).toEqual([
      { event: "conversation_engine_rpc_failed", fields: { operation: "resolve_conversation_engine_owner", safe_rpc_code: "P0001", safe_rpc_summary: "raised_exception", safe_exception: "not_authorized", supabase_host: "project-ref.supabase.co" } },
      { event: "whatsapp_delivery_discovery_rpc_failed", fields: { operation: "discover_recoverable_whatsapp_deliveries", safe_rpc_code: "P0001", safe_rpc_summary: "raised_exception", safe_exception: "not_authorized", supabase_host: "project-ref.supabase.co" } },
      { event: "first_contact_recovery_rpc_failed", fields: { operation: "discover_recoverable_first_contacts", safe_rpc_code: "P0001", safe_rpc_summary: "raised_exception", safe_exception: "not_authorized", supabase_host: "project-ref.supabase.co" } },
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/491234567890|00000000|service-role-secret|\/path|key=secret/);
  });

  it("leaves successful discovery and resolver paths unchanged", async () => {
    const engineRpc = vi.fn().mockResolvedValue({ data: { conversation_id: uuid, engine_owner: "legacy" }, error: null });
    const delivery = { delivery_command_id: uuid, outbound_message_id: "00000000-0000-4000-8000-000000000002", recovery_action: "SAFE_TO_RUN" };
    const deliveryRpc = vi.fn().mockResolvedValue({ data: [delivery], error: null });
    const contact = { conversation_id: uuid, recovery_action: "FOUNDATION_REQUIRED" };
    const contactRpc = vi.fn().mockResolvedValue({ data: [contact], error: null });

    await expect(resolveConversationEngine({ rpc: engineRpc }, { conversation_id: uuid, provider: "whatsapp", sender_scope: "scope", external_identity: "identity" })).resolves.toEqual({ conversation_id: uuid, engine_owner: "legacy" });
    await expect(discoverRecoverableWhatsAppDeliveries(5, { rpc: deliveryRpc })).resolves.toEqual([delivery]);
    await expect(discoverRecoverableFirstContacts(10, { rpc: contactRpc })).resolves.toEqual([contact]);
  });
});
