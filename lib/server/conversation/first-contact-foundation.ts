import "server-only";

import { z } from "zod";

const successSchema = z.object({
  status: z.enum(["created", "partial_completed", "already_complete"]),
  conversation_id: z.string().uuid(), customer_id: z.string().uuid(), project_id: z.string().uuid(),
  conversation_revision: z.number().int().positive(), knowledge_state_version: z.number().int().positive(),
  runtime_revision: z.number().int().positive(),
  runtime_status: z.enum(["idle", "awaiting_customer_answer", "awaiting_evidence", "intermediate_break", "human_review", "collection_stopped"]),
}).strict();
const failureSchema = z.object({
  status: z.enum(["conflict", "actor_unavailable", "actor_invalid", "invalid_state", "persistence_failure"]),
}).strict();
const resultSchema = z.discriminatedUnion("status", [successSchema, failureSchema]);

export type FirstContactFoundationResult = z.infer<typeof resultSchema>;
export type FirstContactFoundationDataSource = {
  rpc(name: "bootstrap_first_contact_foundation", args: { target_conversation_id: string }): Promise<{ data: unknown; error: unknown }>;
};

/** PII-free server composition over the single transactional database authority. */
export async function bootstrapFirstContactFoundation(
  source: FirstContactFoundationDataSource,
  conversationId: string,
): Promise<FirstContactFoundationResult> {
  if (!z.string().uuid().safeParse(conversationId).success) return { status: "invalid_state" };
  const response = await source.rpc("bootstrap_first_contact_foundation", { target_conversation_id: conversationId });
  if (response.error) return { status: "persistence_failure" };
  const parsed = resultSchema.safeParse(response.data);
  return parsed.success ? parsed.data : { status: "persistence_failure" };
}
