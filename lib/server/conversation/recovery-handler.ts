import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import {
  discoverRecoverableConversationCycles,
  runPersistentCustomerMessageCycle,
  type RecoverableCycleRunnerResult,
} from "./recoverable-cycle-runner";
import { createProductiveCycleRuntime, type ProductiveCycleRuntime } from "./productive-cycle-runtime";

export const RECOVERY_BATCH_SIZE = 10;
export const RECOVERY_START_BUDGET_MS = 45_000;

type Summary = Record<RecoverableCycleRunnerResult["kind"], number> & {
  discovered: number;
  attempted: number;
  unexpected_error: number;
  budget_exhausted: boolean;
};

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function recoveryTokenMatches(header: string | null, secret: string): boolean {
  const match = header?.match(/^Bearer ([^\s,]+)$/);
  return Boolean(match && timingSafeEqual(digest(match[1]), digest(secret)));
}

export function createConversationCycleRecoveryHandler(dependencies: Readonly<{
  getSecret?: () => string | undefined;
  createRuntime?: () => ProductiveCycleRuntime;
  now?: () => number;
}> = {}) {
  const getSecret = dependencies.getSecret ?? (() => process.env.CONVERSATION_CYCLE_RECOVERY_SECRET);
  const createRuntime = dependencies.createRuntime ?? createProductiveCycleRuntime;
  const now = dependencies.now ?? (() => performance.now());

  return async function POST(request: Request): Promise<Response> {
    const secret = getSecret();
    if (!secret || secret.trim().length === 0) return new Response(null, { status: 503 });
    if (!recoveryTokenMatches(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

    const startedAt = now();
    const runtime = createRuntime();
    const commands = await discoverRecoverableConversationCycles(runtime.discovery, RECOVERY_BATCH_SIZE);
    const summary: Summary = {
      discovered: commands.length, attempted: 0, completed: 0, human_review: 0,
      failed: 0, busy: 0, stale: 0, ownership_lost: 0, already_terminal: 0,
      unexpected_error: 0, budget_exhausted: false,
    };
    for (const command of commands) {
      if (now() - startedAt >= RECOVERY_START_BUDGET_MS) {
        summary.budget_exhausted = true;
        break;
      }
      summary.attempted += 1;
      try {
        const result = await runPersistentCustomerMessageCycle(runtime.runner, { message_id: command.source_message_id });
        summary[result.kind] += 1;
      } catch {
        summary.unexpected_error += 1;
      }
    }
    return Response.json(summary, { status: 200 });
  };
}
