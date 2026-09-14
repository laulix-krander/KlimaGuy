const SAFE_RPC_SUMMARIES: Readonly<Record<string, string>> = {
  PGRST202: "postgrest_function_not_found_or_stale_schema",
  "42501": "insufficient_privilege",
  P0001: "raised_exception",
};

const SAFE_RPC_EXCEPTIONS = new Set([
  "not_authorized",
  "conversation_not_found",
  "conversation_identity_mismatch",
  "conversation_engine_owner_immutable",
  "whatsapp_delivery_recovery_service_role_required",
]);

export type SafeRuntimeRpcDiagnostic = Readonly<{
  safe_rpc_code?: string;
  safe_rpc_summary: string;
  safe_exception?: string;
  supabase_host: string;
}>;

/** Reduces a Supabase error to explicitly allowlisted, non-sensitive fields. */
export function classifyRuntimeRpcError(error: unknown): SafeRuntimeRpcDiagnostic {
  const candidate = error && typeof error === "object"
    ? error as { code?: unknown; message?: unknown }
    : {};
  const rawCode = typeof candidate.code === "string" ? candidate.code : "";
  const code = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(rawCode) ? rawCode : undefined;
  const message = typeof candidate.message === "string" ? candidate.message : undefined;
  const safeException = message && SAFE_RPC_EXCEPTIONS.has(message) ? message : undefined;

  return {
    ...(code ? { safe_rpc_code: code } : {}),
    safe_rpc_summary: code ? SAFE_RPC_SUMMARIES[code] ?? "database_error" : "database_error",
    ...(safeException ? { safe_exception: safeException } : {}),
    supabase_host: getSupabaseHost(),
  };
}

function getSupabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || "invalid_supabase_url";
  } catch {
    return "invalid_supabase_url";
  }
}
