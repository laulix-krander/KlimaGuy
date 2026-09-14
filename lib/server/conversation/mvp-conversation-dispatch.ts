import "server-only";

import { runFirstContactFoundation } from "./first-contact-foundation-adapter";
import { runProductiveMvpConversationTurn } from "./mvp-conversation-turn";
import { deliverPendingWhatsAppMessage } from "@/lib/server/whatsapp/outbound-delivery";
import type { FirstContactFoundationResult } from "./first-contact-foundation";
import type { MvpTurnRunResult } from "./mvp-conversation-turn";

export type MvpConversationDispatch = (input: Readonly<{
  conversation_id: string;
  message_id: string;
  first_contact: boolean;
}>) => Promise<void>;

type Dependencies = Readonly<{
  establishFirstContact: (conversationId: string) => Promise<FirstContactFoundationResult>;
  runTurn: (conversationId: string, messageId: string) => Promise<MvpTurnRunResult>;
  deliver: (input: { internal_message_id: string }) => Promise<unknown>;
}>;

const FOUNDATION_SUCCESS = new Set<FirstContactFoundationResult["status"]>(["created", "partial_completed", "already_complete"]);

/** Exclusive MVP seam: establish C -> P, run one turn, then use recoverable delivery. */
export function createMvpConversationDispatch(dependencies: Dependencies): MvpConversationDispatch {
  return async (input) => {
    if (input.first_contact) {
      const foundation = await dependencies.establishFirstContact(input.conversation_id);
      if (!FOUNDATION_SUCCESS.has(foundation.status)) throw new Error("mvp_first_contact_foundation_failed");
    }
    const result = await dependencies.runTurn(input.conversation_id, input.message_id);
    if (result.status === "completed") await dependencies.deliver({ internal_message_id: result.outbound_message_id });
  };
}

export const dispatchMvpConversation = createMvpConversationDispatch({
  establishFirstContact: runFirstContactFoundation,
  runTurn: runProductiveMvpConversationTurn,
  deliver: deliverPendingWhatsAppMessage,
});
