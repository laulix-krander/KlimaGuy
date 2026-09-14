import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveConversationEngine } from "@/lib/server/conversation/conversation-engine-routing";
import { discoverRecoverableWhatsAppDeliveries } from "@/lib/server/whatsapp/outbound-delivery";

const migration = readFileSync("supabase/migrations/202609140005_whatsapp_runtime_rpc_contract_repair.sql", "utf8");
const conversationId = "00000000-0000-4000-8000-000000000001";

describe("WhatsApp runtime RPC contract repair", () => {
  it("restores the exact engine-resolution signature consumed by the adapter", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { conversation_id: conversationId, engine_owner: "mvp" }, error: null });
    await expect(resolveConversationEngine({ rpc }, {
      conversation_id: conversationId,
      provider: "whatsapp",
      sender_scope: "1196551136885100",
      external_identity: "4917632091248",
    })).resolves.toEqual({ conversation_id: conversationId, engine_owner: "mvp" });
    expect(rpc).toHaveBeenCalledWith("resolve_conversation_engine_owner", {
      target_conversation_id: conversationId,
      target_provider: "whatsapp",
      target_sender_scope: "1196551136885100",
      target_external_identity: "4917632091248",
      proposed_owner: "mvp",
    });
    expect(migration).toContain("resolve_conversation_engine_owner(\n  target_conversation_id uuid,\n  target_provider text,\n  target_sender_scope text,\n  target_external_identity text,\n  proposed_owner public.conversation_engine_owner");
    expect(migration).toContain("jsonb_build_object('conversation_id',c.id,'engine_owner',c.engine_owner)");
  });

  it("restores the exact bounded recovery-discovery contract consumed by the adapter", async () => {
    const candidate = { delivery_command_id: conversationId, outbound_message_id: "00000000-0000-4000-8000-000000000002", recovery_action: "SAFE_TO_RUN" };
    const rpc = vi.fn().mockResolvedValue({ data: [candidate], error: null });
    await expect(discoverRecoverableWhatsAppDeliveries(99, { rpc })).resolves.toEqual([candidate]);
    expect(rpc).toHaveBeenCalledWith("discover_recoverable_whatsapp_deliveries", { target_limit: 5 });
    expect(migration).toContain("returns table(delivery_command_id uuid,outbound_message_id uuid,recovery_action text)");
    expect(migration).toContain("limit least(greatest(coalesce(target_limit,5),0),5)");
  });

  it("keeps database errors fail-closed at both adapters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(resolveConversationEngine({ rpc }, { conversation_id: conversationId, provider: "whatsapp", sender_scope: "scope", external_identity: "identity" }))
      .rejects.toThrow("conversation_engine_resolution_failed");
    await expect(discoverRecoverableWhatsAppDeliveries(5, { rpc })).rejects.toThrow("delivery_discovery_failed");
  });

  it("retains service-only grants and content-free recovery discovery", () => {
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public,anon,authenticated");
    const discovery = migration.slice(migration.indexOf("create or replace function public.discover_recoverable_whatsapp_deliveries"));
    expect(discovery).not.toMatch(/message_text|external_identity|destination|phone|provider_payload/);
  });
});
