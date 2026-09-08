import "server-only";

import type { AiInferenceFailureClass } from "../../contracts";

type ProviderErrorShape = Readonly<{ name?: unknown; status?: unknown; code?: unknown }>;

export function mapOpenAiError(error: unknown): AiInferenceFailureClass {
  if (!error || typeof error !== "object") return "permanent_provider_failure";
  const candidate = error as ProviderErrorShape;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const status = typeof candidate.status === "number" ? candidate.status : undefined;

  if (name === "APIConnectionTimeoutError" || code === "ETIMEDOUT" || code === "ABORT_ERR" || status === 408) return "timeout";
  if (status === 401 || status === 403) return "configuration_failure";
  if (status === 429 || (status !== undefined && status >= 500)) return "transient_provider_failure";
  if (status === 404 || name === "NotFoundError") return "unsupported";
  return "permanent_provider_failure";
}
