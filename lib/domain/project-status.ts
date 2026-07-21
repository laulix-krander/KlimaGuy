import type { ProjectStatus } from "./types";

const transitionMatrix = {
  new: ["collecting_information", "rejected", "closed"],
  collecting_information: ["technical_review", "rejected", "closed"],
  technical_review: ["collecting_information", "quote_draft", "human_review", "rejected", "closed"],
  quote_draft: ["technical_review", "human_review", "quote_sent", "rejected", "closed"],
  human_review: ["technical_review", "quote_draft", "quote_sent", "rejected", "closed"],
  quote_sent: ["accepted", "rejected", "closed"],
  accepted: ["closed"],
  rejected: ["closed"],
  closed: [],
} as const satisfies Record<ProjectStatus, readonly ProjectStatus[]>;

export const ALLOWED_PROJECT_STATUS_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(transitionMatrix).map(([status, transitions]) => [status, Object.freeze([...transitions])]),
  ) as Record<ProjectStatus, readonly ProjectStatus[]>,
);

export class ProjectStatusTransitionError extends Error {
  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(`Projektstatus-Übergang von ${from} nach ${to} ist nicht erlaubt.`);
    this.name = "ProjectStatusTransitionError";
  }
}

export function isProjectStatusTransitionAllowed(from: ProjectStatus, to: ProjectStatus): boolean {
  return ALLOWED_PROJECT_STATUS_TRANSITIONS[from].includes(to);
}

export function getAllowedProjectStatusTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return [...ALLOWED_PROJECT_STATUS_TRANSITIONS[from]];
}

export function assertProjectStatusTransitionAllowed(from: ProjectStatus, to: ProjectStatus): void {
  if (!isProjectStatusTransitionAllowed(from, to)) {
    throw new ProjectStatusTransitionError(from, to);
  }
}
