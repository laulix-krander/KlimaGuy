import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import {
  createProductiveRecoverableWhatsAppDeliveryDependencies,
  discoverRecoverableWhatsAppDeliveries,
  type RecoverableDelivery,
} from "./outbound-delivery";
import {
  runRecoverableWhatsAppDelivery,
  type RecoverableWhatsAppDeliveryDependencies,
  type RecoverableWhatsAppDeliveryResult,
  type RecoverableWhatsAppDeliveryWork,
} from "./recoverable-delivery-runner";

export const DELIVERY_RECOVERY_BATCH_SIZE = 5;
export const DELIVERY_RECOVERY_START_BUDGET_MS = 35_000;

type ResultStatus = RecoverableWhatsAppDeliveryResult["status"];
type Summary = Record<ResultStatus, number> & {
  discovered: number;
  attempted: number;
  unexpected_error: number;
  budget_exhausted: number;
};

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function deliveryRecoveryTokenMatches(header: string | null, secret: string): boolean {
  const match = header?.match(/^Bearer ([^\s,]+)$/);
  return Boolean(match && timingSafeEqual(digest(match[1]), digest(secret)));
}

function workFromDiscovery(item: RecoverableDelivery): RecoverableWhatsAppDeliveryWork {
  return item.recovery_action === "FINALIZE_AMBIGUOUS"
    ? { recovery_action: "FINALIZE_AMBIGUOUS", delivery_command_id: item.delivery_command_id }
    : { recovery_action: "SAFE_TO_RUN", outbound_message_id: item.outbound_message_id };
}

export function createWhatsAppDeliveryRecoveryHandler(dependencies: Readonly<{
  getSecret?: () => string | undefined;
  discover?: (limit: number) => Promise<RecoverableDelivery[]>;
  createRunnerDependencies?: () => RecoverableWhatsAppDeliveryDependencies;
  run?: typeof runRecoverableWhatsAppDelivery;
  now?: () => number;
}> = {}) {
  const getSecret = dependencies.getSecret ?? (() => process.env.WHATSAPP_DELIVERY_RECOVERY_SECRET);
  const discover = dependencies.discover ?? discoverRecoverableWhatsAppDeliveries;
  const createRunnerDependencies = dependencies.createRunnerDependencies ?? createProductiveRecoverableWhatsAppDeliveryDependencies;
  const run = dependencies.run ?? runRecoverableWhatsAppDelivery;
  const now = dependencies.now ?? (() => performance.now());

  return async function POST(request: Request): Promise<Response> {
    const secret = getSecret();
    if (!secret || secret.trim().length === 0) return new Response(null, { status: 503 });
    if (!deliveryRecoveryTokenMatches(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

    const startedAt = now();
    const runnerDependencies = createRunnerDependencies();
    const items = await discover(DELIVERY_RECOVERY_BATCH_SIZE);
    const summary: Summary = {
      discovered: items.length, attempted: 0, sent: 0, retry_scheduled: 0,
      terminal_failed: 0, ambiguous: 0, busy: 0, not_due: 0,
      already_terminal: 0, retry_not_allowed: 0, attempts_exhausted: 0,
      ownership_lost: 0, failed: 0, unexpected_error: 0, budget_exhausted: 0,
    };

    for (let index = 0; index < items.length; index += 1) {
      if (now() - startedAt >= DELIVERY_RECOVERY_START_BUDGET_MS) {
        summary.budget_exhausted = items.length - index;
        break;
      }
      summary.attempted += 1;
      try {
        const result = await run(workFromDiscovery(items[index]), runnerDependencies);
        summary[result.status] += 1;
      } catch {
        summary.unexpected_error += 1;
      }
    }
    return Response.json(summary, { status: 200 });
  };
}
