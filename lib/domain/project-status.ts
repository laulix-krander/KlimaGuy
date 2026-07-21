import type { ProjectStatus } from "./types";

export const allowedStatusTransitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  new: ["collecting_information", "rejected", "closed"],
  collecting_information: ["technical_review", "rejected", "closed"],
  technical_review: ["collecting_information", "quote_draft", "human_review", "rejected", "closed"],
  quote_draft: ["technical_review", "human_review", "quote_sent", "rejected", "closed"],
  human_review: ["technical_review", "quote_draft", "quote_sent", "rejected", "closed"],
  quote_sent: ["accepted", "rejected", "closed"],
  accepted: ["closed"],
  rejected: ["closed"],
  closed: [],
};

export function canTransitionProjectStatus(from: ProjectStatus, to: ProjectStatus): boolean {
  return from === to || allowedStatusTransitions[from].includes(to);
}

export function getAllowedStatusTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return allowedStatusTransitions[from];
}
