import "server-only";

import { runFirstContactFoundation } from "./first-contact-foundation-adapter";
import { runProductiveMvpConversationTurn } from "./mvp-conversation-turn";
import { deliverPendingWhatsAppMessage } from "@/lib/server/whatsapp/outbound-delivery";

export type MvpConversationDispatch = (input: Readonly<{
  conversation_id: string;
  message_id: string;
  first_contact: boolean;
}>) => Promise<void>;

/** Exclusive MVP seam: establish C -> P, run one turn, then use recoverable delivery. */
export const dispatchMvpConversation: MvpConversationDispatch = async (input) => {
  if (input.first_contact) await runFirstContactFoundation(input.conversation_id);
  const result = await runProductiveMvpConversationTurn(input.conversation_id, input.message_id);
  if (result.status === "completed") await deliverPendingWhatsAppMessage({ internal_message_id: result.outbound_message_id });
};
