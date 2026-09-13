export const CONVERSATION_ENGINE_OWNERS = ["legacy", "mvp"] as const;

export type ConversationEngineOwner = (typeof CONVERSATION_ENGINE_OWNERS)[number];

export type ConversationRoutingIdentity = Readonly<{
  provider: string;
  sender_scope: string;
  external_identity: string;
}>;

const MVP_ROLLOUT_IDENTITIES: readonly ConversationRoutingIdentity[] = [
  {
    provider: "whatsapp",
    sender_scope: "1196551136885100",
    external_identity: "4917632091248",
  },
];

/** Selects an owner only when a Conversation has not yet persisted one. */
export function selectConversationEngine(
  identity: ConversationRoutingIdentity,
  mvpEnabled = process.env.KLIMAGUY_MVP_ENGINE_ENABLED !== "false",
): ConversationEngineOwner {
  if (!mvpEnabled) return "legacy";
  return MVP_ROLLOUT_IDENTITIES.some((candidate) =>
    candidate.provider === identity.provider
    && candidate.sender_scope === identity.sender_scope
    && candidate.external_identity === identity.external_identity
  ) ? "mvp" : "legacy";
}
