import { createClient } from "@/lib/supabase/server";

export type AuditAction =
  | "customer.created"
  | "customer.updated"
  | "customer.soft_deleted"
  | "project.created"
  | "project.updated"
  | "project.status_changed"
  | "project.class_changed"
  | "project.review_flag_changed"
  | "project.soft_deleted"
  | "project_note.created"
  | "project_note.updated"
  | "project_note.soft_deleted";

type AuditMetadata = {
  changed_fields?: string[];
  from?: string | boolean | null;
  to?: string | boolean | null;
  description?: string;
};

export async function writeAuditEvent(input: {
  actorId: string;
  entityType: "customer" | "project" | "project_note";
  entityId: string;
  action: AuditAction;
  metadata?: AuditMetadata;
}): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("create_audit_event", {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_action: input.action,
    p_metadata: input.metadata ?? {},
  });
  void input.actorId;
}
