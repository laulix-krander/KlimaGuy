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
  existing_command_discovered: number;
  missing_command_discovered: number;
  missing_command_bootstrap_succeeded: number;
  missing_command_bootstrap_failed: number;
  attempted: number;
  unexpected_error: number;
  budget_exhausted: boolean;
  recovery_degraded: boolean;
  existing_command_discovery_failed: boolean;
  missing_command_discovery_failed: boolean;
  technical_rehabilitated: number;
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
    const discovery = await discoverRecoverableConversationCycles(runtime.discovery, RECOVERY_BATCH_SIZE);
    const failures = [];
    if (discovery.existing_command.status === "failure") failures.push(discovery.existing_command.failure);
    if (discovery.missing_command.status === "failure") failures.push(discovery.missing_command.failure);
    for (const failure of failures) {
      logger.error({
        event: "conversation_cycle_recovery_discovery_failure",
        discovery_source: failure.discoverySource,
        failure_category: failure.failureCategory,
        safe_error_code: failure.safeErrorCode,
        safe_error_summary: failure.safeErrorSummary,
      });
    }
    const commands = discovery.candidates;
    const summary: Summary = {
      discovered: commands.length, attempted: 0, completed: 0, human_review: 0,
      existing_command_discovered: commands.filter((item) => item.discovery_kind === "existing_command").length,
      missing_command_discovered: commands.filter((item) => item.discovery_kind === "missing_command").length,
      missing_command_bootstrap_succeeded: 0, missing_command_bootstrap_failed: 0,
      technical_rehabilitated: 0,
      failed: 0, busy: 0, stale: 0, ownership_lost: 0, already_terminal: 0,
      unexpected_error: 0, budget_exhausted: false,
      recovery_degraded: failures.length > 0,
      existing_command_discovery_failed: discovery.existing_command.status === "failure",
      missing_command_discovery_failed: discovery.missing_command.status === "failure",
    };
    if (commands.length === 0 && failures.length > 0) {
      logger.info({ event: "conversation_cycle_recovery_summary", ...summary });
      return Response.json({ error:"conversation_cycle_recovery_discovery_failed", ...summary }, { status:503 });
    }
    for (const command of commands) {
      if (now() - startedAt >= RECOVERY_START_BUDGET_MS) {
        summary.budget_exhausted = true;
        break;
      }
      summary.attempted += 1;
      try {
        const result = await runPersistentCustomerMessageCycle(runtime.runner, { message_id: command.source_message_id });
        summary[result.kind] += 1;
        if (result.technical_rehabilitation) {
          summary.technical_rehabilitated += 1;
          logger.info({event:"conversation_cycle_technical_failure_rehabilitated",rehabilitation_count:result.technical_rehabilitation.rehabilitation_count,previous_total_execution_attempt_count:result.technical_rehabilitation.previous_execution_attempt_count,fresh_epoch_budget:result.technical_rehabilitation.fresh_epoch_budget,reason_code:"exhausted_persistence_failure_rehabilitated"});
        }
        if (result.kind === "failed") logger.error({
          event: "conversation_cycle_recovery_item_failure",
          stage: result.diagnostic?.stage ?? "unknown",
          failure_category: result.diagnostic?.failure_category ?? "unknown",
          result_code: result.diagnostic?.result_code,
          ...(result.diagnostic?.safe_rpc_code ? { safe_rpc_code: result.diagnostic.safe_rpc_code } : {}),
          ...(result.diagnostic?.safe_rpc_summary ? { safe_rpc_summary: result.diagnostic.safe_rpc_summary } : {}),
          acquisition_succeeded: result.diagnostic?.acquisition_succeeded ?? false,
          authority_context_loaded: result.diagnostic?.authority_context_loaded ?? false,
          ...(result.diagnostic?.execution_trace ?? {}),
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
    for (const failure of failures) logger.error({
      event:"conversation_cycle_recovery_discovery_degraded",
      failed_discovery_source:failure.discoverySource,
      failure_category:failure.failureCategory,
      safe_error_code:failure.safeErrorCode,
      safe_error_summary:failure.safeErrorSummary,
      healthy_source_candidate_count:commands.filter((candidate) => candidate.discovery_kind !== failure.discoverySource).length,
      total_candidates_processed:summary.attempted,
    });
    logger.info({ event: "conversation_cycle_recovery_summary", ...summary });
    return Response.json(summary, { status: 200 });
  };
}
