import type { Role } from "./types";

export type ProjectField =
  | "customer_id"
  | "title"
  | "status"
  | "project_class"
  | "installation_address"
  | "postal_code"
  | "city"
  | "summary"
  | "requires_human_review"
  | "deleted_at";

export function canCreateCustomer(role: Role): boolean { return role === "admin"; }
export function canEditCustomer(role: Role): boolean { return role === "admin"; }
export function canDeleteCustomer(role: Role): boolean { return role === "admin"; }
export function canCreateProject(role: Role): boolean { return role === "admin"; }
export function canDeleteProject(role: Role): boolean { return role === "admin"; }
export function canEditProjectField(role: Role, field: ProjectField): boolean {
  if (role === "admin") return true;
  return ["status", "project_class", "requires_human_review", "summary"].includes(field);
}
export function canEditNote(role: Role, noteCreatedBy: string, userId: string): boolean {
  return role === "admin" || noteCreatedBy === userId;
}
export function canCustomerBeDeleted(projectStatuses: readonly string[]): boolean {
  return projectStatuses.every((status) => status === "rejected" || status === "closed");
}
