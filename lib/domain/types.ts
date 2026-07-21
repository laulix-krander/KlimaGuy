export const ROLES = ["admin", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export const PROJECT_STATUSES = [
  "new",
  "collecting_information",
  "technical_review",
  "quote_draft",
  "human_review",
  "quote_sent",
  "accepted",
  "rejected",
  "closed",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_CLASSES = ["A", "B", "C", "D"] as const;
export type ProjectClass = (typeof PROJECT_CLASSES)[number];

export const DEFAULT_REQUIRES_HUMAN_REVIEW = true;

export const roles = ROLES;
export const projectStatuses = PROJECT_STATUSES;
export const projectClasses = PROJECT_CLASSES;
