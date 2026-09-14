import { describe, expect, it, vi } from "vitest";
import { createMvpConversationDispatch } from "@/lib/server/conversation/mvp-conversation-dispatch";
import { runMvpConversationTurn, type MvpTurnStore } from "@/lib/server/conversation/mvp-conversation-turn";
import type { MvpAiTurnProvider } from "@/lib/server/ai/mvp-turn-provider";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const foundation = (status: "created" | "partial_completed" | "already_complete") => ({
  status, conversation_id: id(1), customer_id: id(2), project_id: id(3), conversation_revision: 1,
  knowledge_state_version: 1, runtime_revision: 1, runtime_status: "idle" as const,
});

describe("MVP conversation dispatch", () => {
  it("delivers the exact outbound ID after the actual fresh Step-11 response shape", async () => {
    const turnResult = { reply_text: "Danke!", facts_patch: [], missing_facts: ["outdoor_unit_position"], qualification_status: "in_progress", needs_human: false, human_reason: null } as const;
    const store: MvpTurnStore = {
      acquire: vi.fn().mockResolvedValue({ status: "acquired", turn_id: id(4), turn: { inbound_message_id: id(5), conversation_id: id(1), expected_conversation_revision: 1, binding_id: id(6), binding_revision: 1, project_id: id(3) }, project: { title: "Neue Klimaanfrage" }, inbound: { message_id: id(5), text: "Hallo" }, transcript: [], ready_media: [] }),
      commit: vi.fn().mockResolvedValue({ status: "completed", outbound_message_id: id(7), qualification_status: "in_progress", handoff: "none", missing_facts: ["outdoor_unit_position"] }),
      fail: vi.fn(), loadMedia: vi.fn(), revalidate: vi.fn().mockResolvedValue(true),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const provider: MvpAiTurnProvider = { generateTurn: vi.fn().mockResolvedValue(turnResult) };
    const deliver = vi.fn().mockResolvedValue(undefined);
    const dispatch = createMvpConversationDispatch({ establishFirstContact: vi.fn().mockResolvedValue(foundation("created")), runTurn: (conversationId, messageId) => runMvpConversationTurn(conversationId, messageId, { store, provider }), deliver });

    await dispatch({ conversation_id: id(1), message_id: id(5), first_contact: true });
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith({ internal_message_id: id(7) });
  });

  it.each(["conflict", "actor_unavailable", "actor_invalid", "invalid_state", "persistence_failure"] as const)(
    "stops before the AI turn when First Contact returns %s", async (status) => {
      const runTurn = vi.fn(); const deliver = vi.fn();
      const dispatch = createMvpConversationDispatch({ establishFirstContact: vi.fn().mockResolvedValue({ status }), runTurn, deliver });
      await expect(dispatch({ conversation_id: id(1), message_id: id(5), first_contact: true })).rejects.toThrow("mvp_first_contact_foundation_failed");
      expect(runTurn).not.toHaveBeenCalled(); expect(deliver).not.toHaveBeenCalled();
    },
  );

  it.each(["created", "partial_completed", "already_complete"] as const)("proceeds after successful foundation status %s", async (status) => {
    const runTurn = vi.fn().mockResolvedValue({ status: "not_applicable" });
    const dispatch = createMvpConversationDispatch({ establishFirstContact: vi.fn().mockResolvedValue(foundation(status)), runTurn, deliver: vi.fn() });
    await dispatch({ conversation_id: id(1), message_id: id(5), first_contact: true });
    expect(runTurn).toHaveBeenCalledWith(id(1), id(5));
  });
});
