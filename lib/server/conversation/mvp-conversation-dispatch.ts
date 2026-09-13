import "server-only";

import { runFirstContactFoundation } from "./first-contact-foundation-adapter";

export type MvpConversationDispatch = (input: Readonly<{
  conversation_id: string;
  message_id: string;
  first_contact: boolean;
}>) => Promise<void>;

/** Step-4 seam: establish C -> P, but intentionally produce no AI turn or reply. */
export const dispatchMvpConversation: MvpConversationDispatch = async (input) => {
  if (input.first_contact) await runFirstContactFoundation(input.conversation_id);
};
