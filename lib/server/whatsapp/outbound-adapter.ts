import "server-only";

import { z } from "zod";

export const PINNED_WHATSAPP_GRAPH_API_VERSION = "v25.0";

const inputSchema = z.object({
  destination: z.string().min(1).max(255),
  text: z.string().min(1).max(20_000),
  phoneNumberId: z.string().min(1).max(255),
  accessToken: z.string().min(1),
  graphApiVersion: z.literal(PINNED_WHATSAPP_GRAPH_API_VERSION),
}).strict();
const successSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(512) }).passthrough()).min(1) }).passthrough();

export type WhatsAppSendResult =
  | { success: true; providerMessageId: string; acceptedAt: string }
  | { success: false; failureCode: "provider_auth_error" | "rate_limited" | "provider_rejected" | "transient_provider_error" | "ambiguous_send_result"; retryClassification: "retryable" | "requires_reconciliation" | "terminal" | "configuration"; providerSafeCode: string | null };

export async function sendWhatsAppText(raw: z.input<typeof inputSchema>, fetcher: typeof fetch = fetch): Promise<WhatsAppSendResult> {
  const input = inputSchema.parse(raw);
  let response: Response;
  try {
    response = await fetcher(`https://graph.facebook.com/${input.graphApiVersion}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: input.destination, type: "text", text: { body: input.text } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { success: false, failureCode: "ambiguous_send_result", retryClassification: "requires_reconciliation", providerSafeCode: null };
  }
  if (response.ok) {
    const parsed = successSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) return { success: true, providerMessageId: parsed.data.messages[0].id, acceptedAt: new Date().toISOString() };
    return { success: false, failureCode: "provider_rejected", retryClassification: "terminal", providerSafeCode: "invalid_success_contract" };
  }
  if (response.status === 401 || response.status === 403) return { success: false, failureCode: "provider_auth_error", retryClassification: "configuration", providerSafeCode: String(response.status) };
  if (response.status === 429) return { success: false, failureCode: "rate_limited", retryClassification: "retryable", providerSafeCode: "429" };
  if (response.status >= 500) return { success: false, failureCode: "transient_provider_error", retryClassification: "retryable", providerSafeCode: String(response.status) };
  return { success: false, failureCode: "provider_rejected", retryClassification: "terminal", providerSafeCode: String(response.status) };
}
