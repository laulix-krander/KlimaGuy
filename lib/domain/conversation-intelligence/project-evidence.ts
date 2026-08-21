import { z } from "zod";
import { EVIDENCE_TARGET_REGISTRY, evidencePurposeCodeSchema, evidenceTargetKeySchema } from "./evidence-request";

export const EVIDENCE_SOURCE_CHANNELS = ["internal_upload"] as const;
export const EVIDENCE_BINDING_ACTOR_CLASSES = ["admin"] as const;
export const EVIDENCE_BINDING_STATUSES = ["bound", "unclassified", "binding_ambiguous", "invalidated"] as const;

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const bindProjectMediaEvidenceInputSchema = z.object({
  project_id: uuid,
  project_media_id: uuid,
  evidence_target: evidenceTargetKeySchema,
  purpose: evidencePurposeCodeSchema,
}).strict().superRefine((value, context) => {
  const target = EVIDENCE_TARGET_REGISTRY.find((entry) => entry.target_key === value.evidence_target);
  if (!target?.purpose_codes.includes(value.purpose)) context.addIssue({ code: "custom", path: ["purpose"], message: "purpose_target_mismatch" });
});

export const projectEvidenceDtoSchema = z.object({
  evidence_id: uuid,
  project_id: uuid,
  project_media_id: uuid,
  target: evidenceTargetKeySchema,
  purpose: evidencePurposeCodeSchema,
  source_channel: z.enum(EVIDENCE_SOURCE_CHANNELS),
  source_actor_class: z.enum(EVIDENCE_BINDING_ACTOR_CLASSES),
  binding_status: z.enum(EVIDENCE_BINDING_STATUSES),
  created_at: timestamp,
}).strict();

export const conversationEvidenceAssetSchema = z.object({
  evidence_id: uuid,
  target_key: evidenceTargetKeySchema,
  purpose: evidencePurposeCodeSchema,
  availability: z.literal("available_unanalysed"),
}).strict();

export type BindProjectMediaEvidenceInput = z.infer<typeof bindProjectMediaEvidenceInputSchema>;
export type ProjectEvidenceDto = z.infer<typeof projectEvidenceDtoSchema>;
export type ConversationEvidenceAsset = z.infer<typeof conversationEvidenceAssetSchema>;

export function toConversationEvidenceAsset(evidence: ProjectEvidenceDto): ConversationEvidenceAsset {
  return conversationEvidenceAssetSchema.parse({
    evidence_id: evidence.evidence_id,
    target_key: evidence.target,
    purpose: evidence.purpose,
    availability: "available_unanalysed",
  });
}
