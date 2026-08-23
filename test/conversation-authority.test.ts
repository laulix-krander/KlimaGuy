import { describe, expect, it, vi } from "vitest";
import { conversationDtoSchema, isConversationStatusTransitionAllowed, messageDtoSchema, recordStaffMessageInputSchema, trustedRecordMessageInputSchema } from "@/lib/domain/conversation-authority";
import { listConversationMessages } from "@/lib/actions/conversation-authority-service";
const id = "11111111-1111-4111-8111-111111111111";
const at = "2026-08-23T12:00:00.000Z";

describe("conversation authority contracts", () => {
  it("accepts a strict unassigned conversation and rejects extras", () => {
    const fixture = { conversation_id:id, customer_id:null, project_id:null, status:"open", revision:1, created_at:at, updated_at:at };
    expect(conversationDtoSchema.parse(fixture)).toEqual(fixture);
    expect(conversationDtoSchema.safeParse({ ...fixture, provider:"x" }).success).toBe(false);
  });
  it("keeps the status matrix closed, including no reopen from closed", () => {
    expect(isConversationStatusTransitionAllowed("open", "paused")).toBe(true);
    expect(isConversationStatusTransitionAllowed("human_review", "open")).toBe(true);
    expect(isConversationStatusTransitionAllowed("closed", "open")).toBe(false);
  });
  it("validates typed, exact text without rewriting it", () => {
    const message = { message_id:id, conversation_id:id, sequence:1, direction:"inbound", kind:"text", actor_class:"customer", content:{ type:"text", text:"  Original <b>Text</b>  " }, occurred_at:at, created_at:at, reply_to_message_id:null };
    expect(messageDtoSchema.parse(message).content).toEqual(message.content);
    expect(messageDtoSchema.safeParse({ ...message, sequence:0 }).success).toBe(false);
    expect(messageDtoSchema.safeParse({ ...message, phone:"123" }).success).toBe(false);
  });
  it("prevents browser staff input from forging inbound, customer, or ai actors", () => {
    const base = { conversation_id:id, direction:"outbound", kind:"text", content:{type:"text",text:"Hallo"}, idempotency_key:"command-123" };
    expect(recordStaffMessageInputSchema.safeParse(base).success).toBe(true);
    expect(recordStaffMessageInputSchema.safeParse({ ...base, actor_class:"customer" }).success).toBe(false);
    expect(recordStaffMessageInputSchema.safeParse({ ...base, actor_class:"ai" }).success).toBe(false);
  });
  it("requires internal notes to remain internal", () => {
    const base = { conversation_id:id, direction:"outbound", kind:"internal_note", content:{type:"text",text:"Nur intern"}, idempotency_key:"command-123" };
    expect(recordStaffMessageInputSchema.safeParse(base).success).toBe(false);
    expect(recordStaffMessageInputSchema.safeParse({ ...base, direction:"internal" }).success).toBe(true);
  });
  it("keeps occurred_at available only at the trusted boundary", () => {
    expect(trustedRecordMessageInputSchema.safeParse({ conversation_id:id, direction:"inbound", kind:"text", actor_class:"customer", content:{type:"text",text:"Historisch"}, occurred_at:at, idempotency_key:"command-123" }).success).toBe(true);
  });
  it("uses sequence keyset pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({ data:[], error:null });
    expect(await listConversationMessages({rpc}, { conversation_id:id, after_sequence:7, limit:20 })).toEqual({success:true,data:[]});
    expect(rpc).toHaveBeenCalledWith("list_conversation_messages", {target_conversation_id:id,cursor_sequence:7,page_limit:20});
  });
});
