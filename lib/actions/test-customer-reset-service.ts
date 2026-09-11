import "server-only";

import { roleSchema } from "@/lib/domain/schemas";
import { z } from "zod";

const identitySchema = z.object({
  sender_scope: z.string().trim().min(1).max(255),
  external_identity: z.string().trim().min(1).max(255),
}).strict();

export const testCustomerResetCountsSchema = z.object({
  customers: z.number().int().nonnegative(),
  conversations: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
  runtime_states: z.number().int().nonnegative(),
  pending_interactions: z.number().int().nonnegative(),
  snapshots: z.number().int().nonnegative(),
  cycle_commands: z.number().int().nonnegative(),
  ai_results: z.number().int().nonnegative(),
  answer_contexts: z.number().int().nonnegative(),
  provider_receipts_retained: z.number().int().nonnegative(),
  dry_run: z.boolean(),
}).passthrough();

export type TestCustomerResetCounts = z.infer<typeof testCustomerResetCountsSchema>;
export type TestCustomerResetInput = z.infer<typeof identitySchema>;
export type TestCustomerResetResult =
  | { success: true; phase: "preview"; counts: TestCustomerResetCounts; preview_receipt: string }
  | { success: true; phase: "commit"; counts: TestCustomerResetCounts }
  | { success: false; code: "not_authenticated" | "not_authorized" | "invalid_input" | "preview_required" | "configuration_missing" | "reset_failed"; error: string };

export type TestCustomerResetSource = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{ role: unknown } | null>;
  reset(input: TestCustomerResetInput & { dry_run: boolean }): Promise<unknown>;
  issuePreviewReceipt(input: TestCustomerResetInput): Promise<string>;
  verifyPreviewReceipt(receipt: string, input: TestCustomerResetInput): Promise<boolean>;
};

const messages = {
  not_authenticated: "Bitte melde dich an, um den Operator zu verwenden.",
  not_authorized: "Der Zugriff ist nur für Administratoren erlaubt.",
  invalid_input: "Die Transport-Identität ist ungültig.",
  preview_required: "Vor dem endgültigen Reset ist eine passende, aktuelle Vorschau erforderlich.",
  configuration_missing: "Der Reset-Operator ist serverseitig nicht vollständig konfiguriert.",
  reset_failed: "Der sichere Testkunden-Reset konnte nicht ausgeführt werden.",
} as const;

function failure(code: keyof typeof messages): TestCustomerResetResult {
  return { success: false, code, error: messages[code] };
}

export async function operateTestCustomerReset(
  rawInput: unknown,
  phase: "preview" | "commit",
  source: TestCustomerResetSource,
  previewReceipt?: string,
): Promise<TestCustomerResetResult> {
  const input = identitySchema.safeParse(rawInput);
  if (!input.success) return failure("invalid_input");
  try {
    const user = await source.getUser();
    if (!user) return failure("not_authenticated");
    const profile = await source.getProfile(user.id);
    const role = roleSchema.safeParse(profile?.role);
    if (!role.success || role.data !== "admin") return failure("not_authorized");
    if (phase === "commit" && (!previewReceipt || !await source.verifyPreviewReceipt(previewReceipt, input.data))) {
      return failure("preview_required");
    }
    const counts = testCustomerResetCountsSchema.parse(await source.reset({ ...input.data, dry_run: phase === "preview" }));
    if (counts.dry_run !== (phase === "preview")) return failure("reset_failed");
    if (phase === "preview") {
      return { success: true, phase, counts, preview_receipt: await source.issuePreviewReceipt(input.data) };
    }
    return { success: true, phase, counts };
  } catch (error) {
    if (error instanceof Error && error.message === "test_reset_configuration_missing") return failure("configuration_missing");
    return failure("reset_failed");
  }
}
