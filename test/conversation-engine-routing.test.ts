import { describe, expect, it, vi } from "vitest";
import { selectConversationEngine } from "@/lib/domain/conversation-engine";
import { resolveConversationEngine } from "@/lib/server/conversation/conversation-engine-routing";

const conversationId = "00000000-0000-4000-8000-000000000001";
const testIdentity = { provider: "whatsapp", sender_scope: "1196551136885100", external_identity: "4917632091248" };

describe("Conversation engine routing", () => {
  it("selects MVP only for the rollout identity and supports the kill switch", () => {
    expect(selectConversationEngine(testIdentity, true)).toBe("mvp");
    expect(selectConversationEngine({ ...testIdentity, external_identity: "other" }, true)).toBe("legacy");
    expect(selectConversationEngine(testIdentity, false)).toBe("legacy");
  });

  it.each([
    { persisted: "legacy" as const, flag: true },
    { persisted: "mvp" as const, flag: false },
  ])("reuses persisted $persisted ownership instead of flipping", async ({ persisted, flag }) => {
    const rpc = vi.fn().mockResolvedValue({ data: { conversation_id: conversationId, engine_owner: persisted }, error: null });
    await expect(resolveConversationEngine({ rpc }, { conversation_id: conversationId, ...testIdentity }, flag))
      .resolves.toEqual({ conversation_id: conversationId, engine_owner: persisted });
    expect(rpc).toHaveBeenCalledWith("resolve_conversation_engine_owner", expect.objectContaining({ proposed_owner: flag ? "mvp" : "legacy" }));
  });
});
