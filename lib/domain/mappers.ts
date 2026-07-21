import { ProjectStatus, statusLabels } from "./types";
export function statusToLabel(status: ProjectStatus): string { return statusLabels[status]; }
export function humanReviewDefault(value?: boolean): boolean { return value ?? true; }
export function canSoftDeleteCustomer(role: "admin" | "reviewer" | null): boolean { return role === "admin"; }
