import "server-only";

import { conversationStatusSchema } from "@/lib/domain/conversation-authority";
import { roleSchema } from "@/lib/domain/schemas";
import { z } from "zod";

const identitySchema = z.object({
  sender_scope: z.string().trim().min(1).max(255),
  external_identity: z.string().trim().min(1).max(255),
}).strict();

export const testCustomerLifecycleSchema = z.object({
  identity_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable(),
  binding_id: z.string().uuid().nullable(),
  binding_revision: z.number().int().positive().nullable(),
  conversation_id: z.string().uuid().nullable(),
  conversation_revision: z.number().int().positive().nullable(),
  conversation_status: conversationStatusSchema.nullable(),
  project_id: z.string().uuid().nullable(),
}).strict();

export type TestCustomerLifecycle = z.infer<typeof testCustomerLifecycleSchema>;
export type TestCustomerResetInput = z.infer<typeof identitySchema>;
export type TestCustomerResetResult =
  | { success: true; phase: "preview"; lifecycle: TestCustomerLifecycle; preview_receipt: string }
  | { success: true; phase: "commit"; lifecycle: TestCustomerLifecycle; closed: boolean }
  | { success: false; code: "not_authenticated" | "not_authorized" | "invalid_input" | "identity_not_found" | "preview_required" | "configuration_missing" | "reset_failed"; error: string };

export type TestCustomerResetSource = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{ role: unknown } | null>;
  resolve(input: TestCustomerResetInput): Promise<unknown>;
  close(lifecycle: TestCustomerLifecycle): Promise<unknown>;
  issuePreviewReceipt(lifecycle: TestCustomerLifecycle): Promise<string>;
  verifyPreviewReceipt(receipt: string, lifecycle: TestCustomerLifecycle): Promise<boolean>;
};

const messages = {
  not_authenticated: "Bitte melde dich an, um den Operator zu verwenden.",
  not_authorized: "Der Zugriff ist nur für Administratoren erlaubt.",
  invalid_input: "Die Transport-Identität ist ungültig.",
  identity_not_found: "Für diese Angaben wurde keine WhatsApp-Testidentität gefunden.",
  preview_required: "Die Vorschau ist nicht mehr aktuell. Bitte prüfe den aktuellen Zustand erneut.",
  configuration_missing: "Der Reset-Operator ist serverseitig nicht vollständig konfiguriert.",
  reset_failed: "Die aktuelle Unterhaltung konnte nicht geschlossen werden. Bitte erneut prüfen.",
} as const;

function failure(code: keyof typeof messages): TestCustomerResetResult {
  return { success: false, code, error: messages[code] };
}

export async function operateTestCustomerReset(rawInput: unknown, phase: "preview" | "commit", source: TestCustomerResetSource, previewReceipt?: string): Promise<TestCustomerResetResult> {
  const input = identitySchema.safeParse(rawInput);
  if (!input.success) return failure("invalid_input");
  try {
    const user = await source.getUser();
    if (!user) return failure("not_authenticated");
    const profile = await source.getProfile(user.id);
    const role = roleSchema.safeParse(profile?.role);
    if (!role.success || role.data !== "admin") return failure("not_authorized");

    const resolved = await source.resolve(input.data);
    if (resolved === null) return failure("identity_not_found");
    const lifecycle = testCustomerLifecycleSchema.parse(resolved);
    if (phase === "preview") {
      return { success: true, phase, lifecycle, preview_receipt: await source.issuePreviewReceipt(lifecycle) };
    }
    if (!previewReceipt || !await source.verifyPreviewReceipt(previewReceipt, lifecycle)) return failure("preview_required");
    if (lifecycle.conversation_status === null || lifecycle.conversation_status === "closed") {
      return { success: true, phase, lifecycle, closed: false };
    }
    const closedLifecycle = testCustomerLifecycleSchema.parse(await source.close(lifecycle));
    return { success: true, phase, lifecycle: closedLifecycle, closed: true };
  } catch (error) {
    if (error instanceof Error && error.message === "test_reset_configuration_missing") return failure("configuration_missing");
    return failure("reset_failed");
  }
}
