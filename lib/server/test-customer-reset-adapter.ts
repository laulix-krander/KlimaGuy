import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { conversationDtoSchema } from "@/lib/domain/conversation-authority";
import { testCustomerLifecycleSchema, type TestCustomerLifecycle, type TestCustomerResetInput } from "@/lib/actions/test-customer-reset-service";

const RECEIPT_TTL_MS = 10 * 60 * 1000;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("test_reset_configuration_missing");
  return { url, key };
}

function serviceClient() {
  const { url, key } = configuration();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

function lifecycleDigest(lifecycle: TestCustomerLifecycle, key: string) {
  return createHmac("sha256", key).update(JSON.stringify(lifecycle)).digest("base64url");
}

export async function resolveTestCustomerLifecycle(input: TestCustomerResetInput): Promise<TestCustomerLifecycle | null> {
  const client = serviceClient();
  const identityResult = await client.from("conversation_transport_identities").select("id,customer_id").eq("provider", "whatsapp").eq("sender_scope", input.sender_scope).eq("external_identity", input.external_identity).maybeSingle();
  if (identityResult.error) throw new Error("test_reset_resolution_failed");
  if (!identityResult.data) return null;
  const bindingResult = await client.from("conversation_transport_bindings").select("id,conversation_id,revision").eq("transport_identity_id", identityResult.data.id).eq("status", "active").maybeSingle();
  if (bindingResult.error) throw new Error("test_reset_resolution_failed");
  if (!bindingResult.data) return testCustomerLifecycleSchema.parse({ identity_id: identityResult.data.id, customer_id: identityResult.data.customer_id, binding_id: null, binding_revision: null, conversation_id: null, conversation_revision: null, conversation_status: null, project_id: null });
  const conversationResult = await client.from("conversations").select("id,revision,status,current_project_id").eq("id", bindingResult.data.conversation_id).single();
  if (conversationResult.error || !conversationResult.data) throw new Error("test_reset_resolution_failed");
  return testCustomerLifecycleSchema.parse({
    identity_id: identityResult.data.id, customer_id: identityResult.data.customer_id,
    binding_id: bindingResult.data.id, binding_revision: bindingResult.data.revision,
    conversation_id: conversationResult.data.id, conversation_revision: conversationResult.data.revision,
    conversation_status: conversationResult.data.status, project_id: conversationResult.data.current_project_id,
  });
}

export async function closeTestCustomerConversation(client: { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }, lifecycle: TestCustomerLifecycle): Promise<TestCustomerLifecycle> {
  if (!lifecycle.conversation_id || !lifecycle.conversation_revision) return lifecycle;
  const { data, error } = await client.rpc("transition_conversation_status", {
    target_conversation_id: lifecycle.conversation_id, target_status: "closed",
    expected_revision: lifecycle.conversation_revision,
    target_idempotency_key: `admin-test-reset-${lifecycle.binding_id ?? lifecycle.identity_id}-${lifecycle.binding_revision ?? 0}`,
  });
  if (error) throw new Error("test_reset_close_failed");
  const conversation = conversationDtoSchema.parse(data);
  return testCustomerLifecycleSchema.parse({ ...lifecycle, conversation_revision: conversation.revision, conversation_status: conversation.status, project_id: conversation.project_id, customer_id: conversation.customer_id });
}

export async function issueTestResetPreviewReceipt(lifecycle: TestCustomerLifecycle): Promise<string> {
  const { key } = configuration();
  const payload = `${Date.now()}.${lifecycleDigest(lifecycle, key)}`;
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export async function verifyTestResetPreviewReceipt(receipt: string, lifecycle: TestCustomerLifecycle): Promise<boolean> {
  const { key } = configuration();
  try {
    const decoded = Buffer.from(receipt, "base64url").toString("utf8");
    const [issuedAtRaw, digest, signature, ...rest] = decoded.split(".");
    const issuedAt = Number(issuedAtRaw);
    if (rest.length || !issuedAtRaw || !digest || !signature || !Number.isSafeInteger(issuedAt) || Date.now() - issuedAt > RECEIPT_TTL_MS || issuedAt > Date.now()) return false;
    const expectedSignature = createHmac("sha256", key).update(`${issuedAtRaw}.${digest}`).digest();
    const suppliedSignature = Buffer.from(signature, "base64url");
    return digest === lifecycleDigest(lifecycle, key) && suppliedSignature.length === expectedSignature.length && timingSafeEqual(suppliedSignature, expectedSignature);
  } catch { return false; }
}
