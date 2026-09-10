const SAFE_DB_SUMMARIES: Readonly<Record<string, string>> = {
  "23502": "not_null_violation", "23503": "foreign_key_violation",
  "23505": "unique_violation", "23514": "check_violation",
  "42501": "insufficient_privilege", P0001: "raised_exception",
  "42703": "undefined_column", "42804": "datatype_mismatch",
  "22P02": "invalid_text_representation", "40001": "serialization_failure",
  "40P01": "deadlock_detected",
};
const SAFE_DB_STAGES = new Set([
  "eligibility", "recovery_pending_insert", "recovery_snapshot_insert",
  "effort_state_update", "runtime_update", "command_rehabilitation_update",
  "audit_insert", "downstream_acquisition",
]);

export type SafeAcquisitionRpcDiagnostic = Readonly<{
  safe_rpc_code?: string;
  safe_rpc_summary: string;
  safe_db_stage?: string;
}>;

/** Whitelists SQLSTATE and D-19's static phase marker; never forwards DB text. */
export function classifyAcquisitionRpcError(error: unknown): SafeAcquisitionRpcDiagnostic {
  if (!error || typeof error !== "object") return { safe_rpc_summary: "database_error" };
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)
    ? candidate.code : undefined;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const stageMatch = /(?:^|\s)d19_db_stage:([a-z_]+)(?:\s|$)/.exec(message);
  const stage = stageMatch?.[1];
  return {
    ...(code ? { safe_rpc_code: code } : {}),
    safe_rpc_summary: code ? SAFE_DB_SUMMARIES[code] ?? "database_error" : "database_error",
    ...(stage && SAFE_DB_STAGES.has(stage) ? { safe_db_stage: stage } : {}),
  };
}
