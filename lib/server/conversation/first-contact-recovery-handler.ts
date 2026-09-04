import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { discoverRecoverableFirstContacts, FIRST_CONTACT_RECOVERY_BATCH_SIZE, type FirstContactRecoveryItem } from "./first-contact-recovery";
import { runProductiveFirstContactInitialization, type ProductiveFirstContactResult } from "./productive-first-contact";

export const FIRST_CONTACT_RECOVERY_START_BUDGET_MS = 40_000;

type Summary = {
  discovered: number; completed: number; already_complete: number; not_applicable: number;
  stale: number; failed: number; unexpected_error: number; budget_exhausted: number;
};
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function firstContactRecoveryTokenMatches(header: string | null, secret: string): boolean {
  const match = header?.match(/^Bearer ([^\s,]+)$/);
  return Boolean(match && timingSafeEqual(digest(match[1]), digest(secret)));
}

export function createFirstContactRecoveryHandler(dependencies: Readonly<{
  getSecret?: () => string | undefined;
  discover?: (limit: number) => Promise<FirstContactRecoveryItem[]>;
  run?: (input: { conversation_id: string; immediate_delivery: false }) => Promise<ProductiveFirstContactResult>;
  now?: () => number;
}> = {}) {
  const getSecret = dependencies.getSecret ?? (() => process.env.FIRST_CONTACT_RECOVERY_SECRET);
  const discover = dependencies.discover ?? discoverRecoverableFirstContacts;
  const run = dependencies.run ?? runProductiveFirstContactInitialization;
  const now = dependencies.now ?? (() => performance.now());

  return async function POST(request: Request): Promise<Response> {
    const secret = getSecret();
    if (!secret || secret.trim().length === 0) return new Response(null, { status: 503 });
    if (!firstContactRecoveryTokenMatches(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });
    const startedAt = now();
    const items = await discover(FIRST_CONTACT_RECOVERY_BATCH_SIZE);
    const summary: Summary = { discovered: items.length, completed: 0, already_complete: 0, not_applicable: 0, stale: 0, failed: 0, unexpected_error: 0, budget_exhausted: 0 };
    for (let index = 0; index < items.length; index += 1) {
      if (now() - startedAt >= FIRST_CONTACT_RECOVERY_START_BUDGET_MS) {
        summary.budget_exhausted = items.length - index;
        break;
      }
      try {
        const result = await run({ conversation_id: items[index].conversation_id, immediate_delivery: false });
        summary[result.status] += 1;
      } catch {
        summary.unexpected_error += 1;
      }
    }
    return Response.json(summary, { status: 200 });
  };
}
