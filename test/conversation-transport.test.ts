import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  transportBindingAdminDtoSchema,
  transportFailureCodeSchema,
  transportReceiptSchema,
} from "@/lib/domain/conversation-transport";

const migration = readFileSync(
  "supabase/migrations/202608230007_conversation_transport_persistence.sql",
  "utf8",
);

describe("AP-16-04-01 provider-independent transport contracts", () => {
  it("uses a closed provider and failure-code allowlist", () => {
    expect(transportFailureCodeSchema.parse("invalid_signature")).toBe("invalid_signature");
    expect(() => transportFailureCodeSchema.parse("anything")).toThrow();
  });

  it("keeps receipts and admin DTOs strict and free of PII/content", () => {
    const receipt = {
      id: "4eab4990-86e6-41e7-b430-bc792ab70d23",
      provider: "whatsapp",
      eventKind: "inbound_text",
      status: "processed",
      internalMessageId: null,
      failureCode: null,
      receivedAt: "2026-08-23T12:00:00.000Z",
    };
    expect(transportReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(() => transportReceiptSchema.parse({ ...receipt, text: "PII" })).toThrow();
    expect(() =>
      transportBindingAdminDtoSchema.parse({
        transportIdentityId: receipt.id,
        provider: "whatsapp",
        redactedIdentity: "••••1234",
        bindingStatus: "active",
        conversationId: "198df733-4de9-4e91-a200-291c421168c4",
        externalIdentity: "491234",
      }),
    ).toThrow();
  });

  it("isolates authorities, races, RLS, grants and raw payloads", () => {
    for (const table of [
      "conversation_transport_identities",
      "conversation_transport_bindings",
      "transport_webhook_receipts",
      "transport_message_bindings",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("one_active_transport_binding_per_identity");
    expect(migration).toContain("unique(provider,sender_scope,external_identity)");
    expect(migration).toContain("unique(provider,sender_scope,provider_message_id)");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).not.toMatch(/raw_payload\s+(json|jsonb|text|bytea)/);
    expect(migration).not.toMatch(/alter table public\.conversation_messages add/);
    expect(migration).not.toMatch(/alter table public\.conversations add/);
  });
});
