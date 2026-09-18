import "server-only";

import { z } from "zod";
import { klimaguyKnowledgeContextEntrySchema, klimaguyLearningCandidateProposalSchema, type KlimaGuyKnowledgeContextEntry, type KlimaGuyLearningCandidateProposal } from "@/lib/domain/klimaguy-knowledge";

export const KLIMAGUY_KNOWLEDGE_MAX_ENTRIES = 20;
export const KLIMAGUY_KNOWLEDGE_CHARACTER_BUDGET = 8_000;
const rowSchema = klimaguyKnowledgeContextEntrySchema.extend({ priority: z.number().int().min(0).max(100), updated_at: z.string(), id: z.string().uuid() }).strict();

export async function loadRuntimeKlimaGuyKnowledge(source: { read(): Promise<unknown> }): Promise<KlimaGuyKnowledgeContextEntry[]> {
  try {
    const rows = z.array(rowSchema).parse(await source.read()).sort((a, b) => b.priority - a.priority || Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.id.localeCompare(b.id));
    const result: KlimaGuyKnowledgeContextEntry[] = []; let used = 0;
    for (const row of rows.slice(0, KLIMAGUY_KNOWLEDGE_MAX_ENTRIES)) {
      const size = row.category.length + row.title.length + row.guidance.length;
      if (used + size > KLIMAGUY_KNOWLEDGE_CHARACTER_BUDGET) continue;
      result.push({ category: row.category, title: row.title, guidance: row.guidance }); used += size;
    }
    return result;
  } catch {
    console.warn("klimaguy_knowledge_read_failed");
    return [];
  }
}

const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const phone = /(?:\+\d|\b0\d)[\d ()/.-]{6,}\d\b/u;
export function sanitizeLearningCandidates(candidates: readonly KlimaGuyLearningCandidateProposal[], piiValues: readonly (string | null | undefined)[]): KlimaGuyLearningCandidateProposal[] {
  const known = piiValues.map((value) => value?.trim().toLocaleLowerCase("de-DE")).filter((value): value is string => Boolean(value && value.length >= 3));
  return candidates.flatMap((candidate) => {
    const valid = klimaguyLearningCandidateProposalSchema.safeParse(candidate); if (!valid.success) return [];
    const text = `${valid.data.title} ${valid.data.proposed_guidance} ${valid.data.rationale}`;
    const normalized = text.toLocaleLowerCase("de-DE");
    return email.test(text) || phone.test(text) || known.some((value) => normalized.includes(value)) ? [] : [valid.data];
  });
}
