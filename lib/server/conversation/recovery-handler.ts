import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import {
  discoverRecoverableConversationCycles,
  RecoveryDiscoveryError,
  runPersistentCustomerMessageCycle,
  type RecoverableCycleRunnerResult,
} from "./recoverable-cycle-runner";
import { createProductiveCycleRuntime, type ProductiveCycleRuntime } from "./productive-cycle-runtime";

export const RECOVERY_BATCH_SIZE = 10;
export const RECOVERY_START_BUDGET_MS = 45_000;

type Summary = Record<RecoverableCycleRunnerResult["kind"], number> & {
  discovered: number;
  existing_command_discovered: number;
  missing_command_discovered: number;
  missing_command_bootstrap_succeeded: number;
  missing_command_bootstrap_failed: number;
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
  logger?: Pick<Console, "info" | "error">;
}> = {}) {
  const getSecret = dependencies.getSecret ?? (() => process.env.CONVERSATION_CYCLE_RECOVERY_SECRET);
  const createRuntime = dependencies.createRuntime ?? createProductiveCycleRuntime;
  const now = dependencies.now ?? (() => performance.now());
  const logger = dependencies.logger ?? console;

  return async function POST(request: Request): Promise<Response> {
    const secret = getSecret();
    if (!secret || secret.trim().length === 0) return new Response(null, { status: 503 });
    if (!recoveryTokenMatches(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

    const startedAt = now();
    const runtime = createRuntime();
    let commands;
    try {
      commands = await discoverRecoverableConversationCycles(runtime.discovery, RECOVERY_BATCH_SIZE);
    } catch (error) {
      const failure = error instanceof RecoveryDiscoveryError ? error : undefined;
      logger.error({
        event: "conversation_cycle_recovery_discovery_failure",
        discovery_source: failure?.discoverySource ?? "unknown",
        failure_category: failure?.failureCategory ?? "unexpected_error",
        safe_error_code: failure?.safeErrorCode,
        safe_error_summary: failure?.safeErrorSummary,
      });
      return Response.json({ error: "conversation_cycle_recovery_discovery_failed" }, { status: 503 });
    }
    const summary: Summary = {
      discovered: commands.length, attempted: 0, completed: 0, human_review: 0,
      existing_command_discovered: commands.filter((item) => item.discovery_kind === "existing_command").length,
      missing_command_discovered: commands.filter((item) => item.discovery_kind === "missing_command").length,
      missing_command_bootstrap_succeeded: 0, missing_command_bootstrap_failed: 0,
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
        if (result.kind === "failed") logger.error({
          event: "conversation_cycle_recovery_item_failure",
          stage: result.diagnostic?.stage ?? "unknown",
          failure_category: result.diagnostic?.failure_category ?? "unknown",
          result_code: result.diagnostic?.result_code,
          acquisition_succeeded: result.diagnostic?.acquisition_succeeded ?? false,
          authority_context_loaded: result.diagnostic?.authority_context_loaded ?? false,
          ai_attempt_reservation_reached: result.diagnostic?.ai_attempt_reservation_reached ?? false,
          failure_persistence_succeeded: result.diagnostic?.failure_persistence_succeeded ?? false,
        });
        if (command.discovery_kind === "missing_command") {
          if (result.kind === "completed" || result.kind === "human_review" || result.kind === "already_terminal") summary.missing_command_bootstrap_succeeded += 1;
          else summary.missing_command_bootstrap_failed += 1;
        }
      } catch {
        summary.unexpected_error += 1;
        if (command.discovery_kind === "missing_command") summary.missing_command_bootstrap_failed += 1;
      }
    }
    logger.info({ event: "conversation_cycle_recovery_summary", ...summary });
    return Response.json(summary, { status: 200 });
  };
}
