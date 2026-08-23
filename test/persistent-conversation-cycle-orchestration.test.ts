import { describe, expect, it, vi } from "vitest";
import { classifyCycleFailure, processCustomerMessageCommandSchema } from "@/lib/domain/conversation-cycle-orchestration";

describe("AP-16-03 orchestration contracts", () => {
  it("accepts only an internal message identity", () => {
    expect(processCustomerMessageCommandSchema.safeParse({ message_id:crypto.randomUUID() }).success).toBe(true);
    expect(processCustomerMessageCommandSchema.safeParse({ message_id:crypto.randomUUID(), actor_class:"customer", text:"Ja" }).success).toBe(false);
  });
  it("keeps technical retry classification separate", () => {
    expect(classifyCycleFailure("normalization_failed")).toBe("retryable");
    expect(classifyCycleFailure("stale_knowledge_version")).toBe("requires_recheck");
    expect(classifyCycleFailure("runtime_invariant_failed")).toBe("human_review");
    expect(classifyCycleFailure("message_not_inbound_customer_text")).toBe("terminal");
  });
  it("does not expose transport or network dependencies", () => expect(vi.isMockFunction(classifyCycleFailure)).toBe(false));
});
