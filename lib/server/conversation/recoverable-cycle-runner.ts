import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { processPersistentCustomerMessage } from "@/lib/actions/persistent-conversation-cycle-service";
import { createPersistentCycleDataSource, type PersistentCycleDataSourceDependencies } from "@/lib/server/conversation/persistent-cycle-data-source";
import type { ProductiveCustomerAnswerInterpreter } from "@/lib/server/ai/customer-answer-interpreter";
import type { CustomerAnswerCycleExecutionTrace } from "@/lib/domain/conversation-cycle-orchestration";

/** The deterministic cycle has no network inference; five minutes bounds crash ownership without requiring heartbeats. */
export const CONVERSATION_CYCLE_LEASE_SECONDS = 5 * 60;
export const RECOVERABLE_CYCLE_DISCOVERY_LIMIT = 100;

export type RecoverableCycleRunnerResult =
  | Readonly<{ kind:"completed"; command_id?:string; outbound_message_id?:string; technical_rehabilitation?:TechnicalRehabilitation }>
  | Readonly<{ kind:"human_review" | "already_terminal" | "stale" | "busy" | "ownership_lost"; command_id?:string; technical_rehabilitation?:TechnicalRehabilitation }>
  | Readonly<{ kind:"failed"; command_id?:string; technical_rehabilitation?:TechnicalRehabilitation; diagnostic?: { stage:"input" | "acquisition" | "context_read" | "execution" | "failure_persistence"; failure_category:string; result_code?:string; safe_rpc_code?:string; safe_rpc_summary?:string; acquisition_succeeded:boolean; authority_context_loaded:boolean; execution_trace:CustomerAnswerCycleExecutionTrace } }>;

const emptyExecutionTrace = (interpreterPresent:boolean):CustomerAnswerCycleExecutionTrace => ({
  interpreter_present:interpreterPresent,normalization_reached:false,normalization_succeeded:false,
  ai_eligibility_evaluated:false,ai_eligible:null,ai_reservation_attempted:false,ai_reservation_succeeded:null,
  ai_reservation_result_code:null,ai_reservation_attempt_number:null,ai_interpreter_invoked:false,
  ai_interpreter_succeeded:null,ai_interpreter_outcome:null,ai_interpreter_failure_class:null,
  deterministic_cycle_branch:null,deterministic_cycle_invoked:false,deterministic_cycle_succeeded:null,
  deterministic_cycle_failure_code:null,interpretation_failure_code:null,failure_persistence_attempted:false,failure_persistence_succeeded:null,
});

export type TechnicalRehabilitation = Readonly<{ rehabilitation_count:number; previous_execution_attempt_count:number; fresh_epoch_budget:number }>;

export type RecoverableCycleDependencies = PersistentCycleDataSourceDependencies & Readonly<{
  createOwnerId?: () => string;
  customerAnswerInterpreter?: ProductiveCustomerAnswerInterpreter;
}>;

/** Executes one internal message identity. Contents stay behind the C read authority. */
export async function runPersistentCustomerMessageCycle(
  dependencies: RecoverableCycleDependencies,
  input: Readonly<{ message_id:string }>,
): Promise<RecoverableCycleRunnerResult> {
  if (!z.string().uuid().safeParse(input.message_id).success) return { kind:"failed", diagnostic:{stage:"input",failure_category:"invalid_input",result_code:"invalid_input",acquisition_succeeded:false,authority_context_loaded:false,execution_trace:emptyExecutionTrace(Boolean(dependencies.customerAnswerInterpreter))} };
  let ownershipLost = false;
  let technicalRehabilitation: TechnicalRehabilitation | undefined;
  const source = createPersistentCycleDataSource(dependencies, {
    ownerId:(dependencies.createOwnerId ?? randomUUID)(),
    leaseSeconds:CONVERSATION_CYCLE_LEASE_SECONDS,
    onOwnershipLost:() => { ownershipLost = true; },
    onTechnicalRehabilitated:(details) => { technicalRehabilitation = {rehabilitation_count:details.rehabilitationCount,previous_execution_attempt_count:details.previousExecutionAttemptCount,fresh_epoch_budget:details.freshEpochBudget}; },
  });
  try {
    const result = await processPersistentCustomerMessage(source, input, dependencies.customerAnswerInterpreter);
    const executionTrace = result.execution_trace ?? emptyExecutionTrace(Boolean(dependencies.customerAnswerInterpreter));
    const rehabilitation = technicalRehabilitation ? {technical_rehabilitation:technicalRehabilitation} : {};
    if (ownershipLost) return { kind:"ownership_lost", ...(result.command_id ? {command_id:result.command_id} : {}), ...rehabilitation };
    if (result.success) {
      if (result.kind === "already_processed") return { kind:"already_terminal", command_id:result.command_id, ...rehabilitation };
      if (result.kind === "human_review") return { kind:"human_review", command_id:result.command_id, ...rehabilitation };
      return { kind:"completed", command_id:result.command_id, ...(result.outbound_message_id ? {outbound_message_id:result.outbound_message_id} : {}), ...(technicalRehabilitation ? {technical_rehabilitation:technicalRehabilitation}:{}) };
    }
    if (result.code === "interaction_not_current") return { kind:"busy", ...(result.command_id ? {command_id:result.command_id} : {}), ...rehabilitation };
    if (result.code === "stale_runtime_revision" || result.code === "stale_knowledge_version") return { kind:"stale", ...(result.command_id ? {command_id:result.command_id} : {}), ...rehabilitation };
    if (result.code === "persistence_failed" && result.command_id && !ownershipLost) {
      const failurePersisted = await source.failCustomerMessage(result.command_id, "persistence_failed");
      const persistedTrace = {...executionTrace,failure_persistence_attempted:true,failure_persistence_succeeded:failurePersisted};
      if (ownershipLost) return { kind:"ownership_lost", command_id:result.command_id, ...rehabilitation };
      return { kind:"failed", command_id:result.command_id, ...rehabilitation, diagnostic:{stage:failurePersisted ? result.diagnostic?.stage ?? "execution" : "failure_persistence",failure_category:failurePersisted ? result.diagnostic?.failure_category ?? "controlled_failure" : "persistence_failed",result_code:result.code,...(result.diagnostic?.safe_rpc_code ? {safe_rpc_code:result.diagnostic.safe_rpc_code}:{}),...(result.diagnostic?.safe_rpc_summary ? {safe_rpc_summary:result.diagnostic.safe_rpc_summary}:{}),acquisition_succeeded:true,authority_context_loaded:result.diagnostic?.stage !== "context_read",execution_trace:persistedTrace} };
    }
    return { kind:"failed", ...(result.command_id ? {command_id:result.command_id} : {}), ...rehabilitation, diagnostic:{stage:result.diagnostic?.stage ?? "execution",failure_category:result.diagnostic?.failure_category ?? "controlled_failure",result_code:result.code,...(result.diagnostic?.safe_rpc_code ? {safe_rpc_code:result.diagnostic.safe_rpc_code}:{}),...(result.diagnostic?.safe_rpc_summary ? {safe_rpc_summary:result.diagnostic.safe_rpc_summary}:{}),acquisition_succeeded:Boolean(result.command_id),authority_context_loaded:Boolean(result.command_id) && result.diagnostic?.stage !== "context_read",execution_trace:executionTrace} };
  } catch {
    return ownershipLost ? { kind:"ownership_lost" } : { kind:"failed" };
  }
}

const postgresTimestamp = z.string().refine(
  (value) => /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value) && !Number.isNaN(Date.parse(value)),
  "expected a PostgreSQL timestamptz string",
);
const recoverableRow = z.object({ command_id:z.string().uuid(), source_message_id:z.string().uuid(), lease_expired_at:postgresTimestamp, requires_technical_rehabilitation:z.boolean().optional().default(false) }).strict();
const missingCommandRow = z.object({ source_message_id:z.string().uuid(), discovered_at:postgresTimestamp }).strict();
export type RecoverableCycleCandidate = Readonly<{ source_message_id:string; discovery_kind:"existing_command" | "missing_command"; requires_technical_rehabilitation?:boolean }>;
export type RecoveryDiscoveryKind = RecoverableCycleCandidate["discovery_kind"];
export type RecoveryDiscoveryFailureCategory = "rpc_error" | "response_validation_error";

export class RecoveryDiscoveryError extends Error {
  readonly name = "RecoveryDiscoveryError";
  constructor(
    readonly discoverySource: RecoveryDiscoveryKind,
    readonly failureCategory: RecoveryDiscoveryFailureCategory,
    readonly safeErrorCode?: string,
    readonly safeErrorSummary?: string,
  ) { super("conversation_cycle_recovery_discovery_failed"); }
}
export type RecoveryDiscoverySourceResult =
  | Readonly<{ status:"success"; candidates:readonly RecoverableCycleCandidate[] }>
  | Readonly<{ status:"failure"; failure:RecoveryDiscoveryError }>;
export type RecoveryDiscoveryResult = Readonly<{
  candidates:readonly RecoverableCycleCandidate[];
  existing_command:RecoveryDiscoverySourceResult;
  missing_command:RecoveryDiscoverySourceResult;
}>;
export type RecoveryDiscoverySource = {
  rpc(name:"discover_recoverable_conversation_cycles" | "discover_missing_customer_answer_cycles", args:{ result_limit:number }):Promise<{data:unknown;error:unknown}>;
};

const safeCode = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, 32);
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(value) ? value : undefined;
};
export const extractSafeRecoveryRpcErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : undefined;
  const cause = record.cause && typeof record.cause === "object" ? record.cause as Record<string, unknown> : undefined;
  return safeCode(record.code) ?? safeCode(nested?.code) ?? safeCode(cause?.code)
    ?? safeCode(record.status) ?? safeCode(record.statusCode);
};
const rpcFailure = (kind: RecoveryDiscoveryKind, error: unknown) => {
  return new RecoveryDiscoveryError(kind, "rpc_error", extractSafeRecoveryRpcErrorCode(error), "PostgREST RPC returned an error");
};
const shape = (value: unknown) => value === null ? "null" : Array.isArray(value) ? `array(rows=${value.length})` : typeof value;
const parseRows = <T>(kind: RecoveryDiscoveryKind, schema: z.ZodType<T,z.ZodTypeDef,unknown>, data: unknown): T => {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`).join(",");
  throw new RecoveryDiscoveryError(kind, "response_validation_error", undefined, `${shape(data)};issues=${issues}`);
};

async function discoverSource(
  source:RecoveryDiscoverySource,
  kind:RecoveryDiscoveryKind,
  rpcName:"discover_recoverable_conversation_cycles" | "discover_missing_customer_answer_cycles",
  schema:z.ZodType<readonly RecoverableCycleCandidate[],z.ZodTypeDef,unknown>,
  bounded:number,
):Promise<RecoveryDiscoverySourceResult> {
  try {
    const response = await source.rpc(rpcName, {result_limit:bounded});
    if (response.error) return {status:"failure",failure:rpcFailure(kind,response.error)};
    return {status:"success",candidates:parseRows<readonly RecoverableCycleCandidate[]>(kind,schema,response.data)};
  } catch (error) {
    return {status:"failure",failure:error instanceof RecoveryDiscoveryError ? error : rpcFailure(kind,error)};
  }
}

export async function discoverRecoverableConversationCycles(source:RecoveryDiscoverySource, limit=RECOVERABLE_CYCLE_DISCOVERY_LIMIT):Promise<RecoveryDiscoveryResult> {
  const bounded = z.number().int().min(1).max(RECOVERABLE_CYCLE_DISCOVERY_LIMIT).catch(RECOVERABLE_CYCLE_DISCOVERY_LIMIT).parse(limit);
  const existing = await discoverSource(source,"existing_command","discover_recoverable_conversation_cycles",
    z.array(recoverableRow).max(bounded).transform((rows) => rows.map((row) => ({source_message_id:row.source_message_id,discovery_kind:"existing_command" as const,requires_technical_rehabilitation:row.requires_technical_rehabilitation}))),bounded);
  const missing = await discoverSource(source,"missing_command","discover_missing_customer_answer_cycles",
    z.array(missingCommandRow).max(bounded).transform((rows) => rows.map((row) => ({source_message_id:row.source_message_id,discovery_kind:"missing_command" as const}))),bounded);
  const candidates: RecoverableCycleCandidate[] = [];
  if (existing.status === "success") candidates.push(...existing.candidates);
  const seen = new Set(candidates.map((candidate) => candidate.source_message_id));
  if (missing.status === "success") for (const candidate of missing.candidates) {
    if (!seen.has(candidate.source_message_id) && candidates.length < bounded) {
      candidates.push(candidate);
      seen.add(candidate.source_message_id);
    }
  }
  return {candidates:candidates.slice(0,bounded),existing_command:existing,missing_command:missing};
}
