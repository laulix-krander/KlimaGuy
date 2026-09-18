import { z } from "zod";

export const KLIMAGUY_KNOWLEDGE_CATEGORIES = ["customer_communication", "qualification_behavior", "photo_guidance", "human_handoff", "hvac_practice"] as const;
export const klimaguyKnowledgeCategorySchema = z.enum(KLIMAGUY_KNOWLEDGE_CATEGORIES);
export const klimaguyKnowledgeTitleSchema = z.string().trim().min(3).max(120);
export const klimaguyKnowledgeGuidanceSchema = z.string().trim().min(10).max(800);
export const klimaguyLearningRationaleSchema = z.string().trim().min(10).max(600);
export const klimaguyKnowledgePrioritySchema = z.number().int().min(0).max(100);
export const klimaguyKnowledgeContextEntrySchema = z.object({ category: klimaguyKnowledgeCategorySchema, title: klimaguyKnowledgeTitleSchema, guidance: klimaguyKnowledgeGuidanceSchema }).strict();
export const klimaguyLearningCandidateProposalSchema = z.object({ category: klimaguyKnowledgeCategorySchema, title: klimaguyKnowledgeTitleSchema, proposed_guidance: klimaguyKnowledgeGuidanceSchema, rationale: klimaguyLearningRationaleSchema }).strict();
export const klimaguyKnowledgeEntrySchema = klimaguyKnowledgeContextEntrySchema.extend({ id: z.string().uuid(), priority: klimaguyKnowledgePrioritySchema, status: z.enum(["active", "archived"]), source_type: z.enum(["manual", "learning_candidate"]), revision: z.number().int().positive(), created_by: z.string().uuid().nullable(), updated_by: z.string().uuid().nullable(), created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }) }).strict();
export const klimaguyLearningCandidateSchema = klimaguyLearningCandidateProposalSchema.extend({ id: z.string().uuid(), status: z.enum(["pending", "approved", "rejected"]), occurrence_count: z.number().int().positive(), revision: z.number().int().positive(), source_turn_id: z.string().uuid(), source_project_id: z.string().uuid(), source_conversation_id: z.string().uuid(), source_inbound_message_id: z.string().uuid(), source_outbound_message_id: z.string().uuid(), reviewed_by: z.string().uuid().nullable(), reviewed_at: z.string().datetime({ offset: true }).nullable(), promoted_knowledge_entry_id: z.string().uuid().nullable(), created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }) }).strict();
export type KlimaGuyKnowledgeContextEntry = z.infer<typeof klimaguyKnowledgeContextEntrySchema>;
export type KlimaGuyLearningCandidateProposal = z.infer<typeof klimaguyLearningCandidateProposalSchema>;
export type KlimaGuyKnowledgeEntry = z.infer<typeof klimaguyKnowledgeEntrySchema>;
export type KlimaGuyLearningCandidate = z.infer<typeof klimaguyLearningCandidateSchema>;
export const KLIMAGUY_KNOWLEDGE_CATEGORY_LABELS: Record<(typeof KLIMAGUY_KNOWLEDGE_CATEGORIES)[number], string> = { customer_communication: "Kundenkommunikation", qualification_behavior: "Qualifikation", photo_guidance: "Foto-Hinweise", human_handoff: "Übergabe an Menschen", hvac_practice: "Klima-Fachpraxis" };
