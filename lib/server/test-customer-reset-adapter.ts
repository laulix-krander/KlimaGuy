import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { TestCustomerResetCounts, TestCustomerResetInput } from "@/lib/actions/test-customer-reset-service";

const RECEIPT_TTL_MS = 10 * 60 * 1000;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("test_reset_configuration_missing");
  return { url, key };
}

function identityDigest(input: TestCustomerResetInput, key: string) {
  return createHmac("sha256", key).update(`whatsapp\0${input.sender_scope}\0${input.external_identity}`).digest("base64url");
}

export async function resetTestTransportCustomer(input: TestCustomerResetInput & { dry_run: boolean }): Promise<TestCustomerResetCounts> {
  const { url, key } = configuration();
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc("reset_test_transport_customer", {
    target_provider: "whatsapp",
    target_sender_scope: input.sender_scope,
    target_external_identity: input.external_identity,
    target_confirmation: "RESET TEST CUSTOMER",
    dry_run: input.dry_run,
  });
  if (error) throw new Error("test_reset_rpc_failed");
  return data as TestCustomerResetCounts;
}

export async function issueTestResetPreviewReceipt(input: TestCustomerResetInput): Promise<string> {
  const { key } = configuration();
  const payload = `${Date.now()}.${identityDigest(input, key)}`;
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export async function verifyTestResetPreviewReceipt(receipt: string, input: TestCustomerResetInput): Promise<boolean> {
  const { key } = configuration();
  try {
    const decoded = Buffer.from(receipt, "base64url").toString("utf8");
    const [issuedAtRaw, digest, signature, ...rest] = decoded.split(".");
    const issuedAt = Number(issuedAtRaw);
    if (rest.length || !issuedAtRaw || !digest || !signature || !Number.isSafeInteger(issuedAt) || Date.now() - issuedAt > RECEIPT_TTL_MS || issuedAt > Date.now()) return false;
    const payload = `${issuedAtRaw}.${digest}`;
    const expectedSignature = createHmac("sha256", key).update(payload).digest();
    const suppliedSignature = Buffer.from(signature, "base64url");
    return digest === identityDigest(input, key) && suppliedSignature.length === expectedSignature.length && timingSafeEqual(suppliedSignature, expectedSignature);
  } catch {
    return false;
  }
}
