import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { RecoverableCycleDependencies, RecoveryDiscoverySource } from "./recoverable-cycle-runner";
import { createCustomerAnswerInterpreter } from "@/lib/server/ai/customer-answer-interpreter";
import type { StructuredInferenceProvider } from "@/lib/server/ai/contracts";

export type ProductiveCycleRuntime = Readonly<{
  discovery: RecoveryDiscoverySource;
  runner: RecoverableCycleDependencies;
}>;

/** Lazily creates the single server-side RPC capability used by all existing cycle authorities. */
export function createProductiveCycleRuntime(): ProductiveCycleRuntime {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("conversation_cycle_configuration_error");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const source = {
    async rpc(name: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  };
  let productiveProvider: StructuredInferenceProvider | undefined;
  const provider: StructuredInferenceProvider = {
    async generateStructuredInference(request) {
      if (!productiveProvider) {
        const { OpenAiStructuredInferenceProvider } = await import("@/lib/server/ai/providers/openai/adapter");
        productiveProvider = new OpenAiStructuredInferenceProvider();
      }
      return productiveProvider.generateStructuredInference(request);
    },
  };
  return {
    discovery: source,
    runner: { claim: source, read: source, commit: source,
      ...(process.env.AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED === "true"
        ? { customerAnswerInterpreter:createCustomerAnswerInterpreter(provider) }
        : {}) },
  };
}
