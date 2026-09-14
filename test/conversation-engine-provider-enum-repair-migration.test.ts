import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const transportMigration = readFileSync(
  "supabase/migrations/202608230007_conversation_transport_persistence.sql",
  "utf8",
);
const repairMigration = readFileSync(
  "supabase/migrations/202609140006_fix_conversation_engine_provider_enum_comparison.sql",
  "utf8",
);

describe("Conversation engine provider enum comparison repair", () => {
  it("confirms both provider columns use the transport provider enum", () => {
    expect(transportMigration).toMatch(
      /create table public\.conversation_transport_identities[\s\S]*?provider public\.conversation_transport_provider not null/,
    );
    expect(transportMigration).toMatch(
      /create table public\.conversation_transport_bindings[\s\S]*?provider public\.conversation_transport_provider not null/,
    );
  });

  it("preserves the text-based RPC signature and explicitly converts it for both comparisons", () => {
    expect(repairMigration).toContain(
      "resolve_conversation_engine_owner(\n  target_conversation_id uuid,\n  target_provider text,\n  target_sender_scope text,\n  target_external_identity text,\n  proposed_owner public.conversation_engine_owner",
    );
    expect(repairMigration).toContain(
      "b.provider=target_provider::public.conversation_transport_provider",
    );
    expect(repairMigration).toContain(
      "i.provider=target_provider::public.conversation_transport_provider",
    );
    expect(repairMigration).not.toMatch(/(?:b|i)\.provider\s*=\s*target_provider(?!::)/);
  });

  it("retains resolver authorization, binding, immutable-owner, and response semantics", () => {
    expect(repairMigration).toContain("auth.role() is distinct from 'service_role'");
    expect(repairMigration).toContain("where id=target_conversation_id for update");
    expect(repairMigration).toContain("raise exception 'conversation_not_found'");
    expect(repairMigration).toContain("b.status='active'");
    expect(repairMigration).toContain("i.sender_scope=target_sender_scope");
    expect(repairMigration).toContain("i.external_identity=target_external_identity");
    expect(repairMigration).toContain("raise exception 'conversation_identity_mismatch'");
    expect(repairMigration).toContain("if c.engine_owner is null then");
    expect(repairMigration).toContain("set_config('app.conversation_engine_authority','allowed',true)");
    expect(repairMigration).toContain(
      "jsonb_build_object('conversation_id',c.id,'engine_owner',c.engine_owner)",
    );
    expect(repairMigration).toContain("security definer set search_path=public,pg_temp");
  });

  it("replaces only the resolver and performs no table or destructive operation", () => {
    expect(repairMigration.match(/create or replace function/gi)).toHaveLength(1);
    expect(repairMigration).not.toMatch(/\b(?:alter|create|drop|truncate)\s+table\b/i);
    expect(repairMigration).not.toMatch(/\b(?:delete\s+from|drop\s+function)\b/i);
  });
});
