import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureResult = "valid" | "missing_signature" | "invalid_signature";

export function verifyWhatsAppSignature(body: Uint8Array, signature: string | null, secret: string): SignatureResult {
  if (!signature) return "missing_signature";
  if (!/^sha256=[0-9a-f]{64}$/.test(signature)) return "invalid_signature";
  const supplied = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? "valid" : "invalid_signature";
}

export function verifyWhatsAppChallenge(mode: string | null, token: string | null, expected: string): boolean {
  if (mode !== "subscribe" || token === null) return false;
  const supplied = Buffer.from(token);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}
