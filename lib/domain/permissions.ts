import type { Role } from "./types";

export function canCreateCustomer(role: Role): boolean {
  return role === "admin";
}

export function canEditCustomer(role: Role): boolean {
  return role === "admin";
}

export function canSoftDeleteCustomer(role: Role | null): boolean {
  return role === "admin";
}

export function canCreateProject(role: Role): boolean {
  return role === "admin";
}

export function canEditProjectCoreFields(role: Role): boolean {
  return role === "admin";
}

export function canChangeProjectStatus(role: Role): boolean {
  return role === "admin" || role === "reviewer";
}

export function canChangeProjectClass(role: Role): boolean {
  return role === "admin" || role === "reviewer";
}

export function canChangeHumanReview(role: Role): boolean {
  return role === "admin";
}

export function canEditProjectSummary(role: Role): boolean {
  return role === "admin";
}

export function canSoftDeleteProject(role: Role): boolean {
  return role === "admin";
}

export function canCreateProjectNote(role: Role): boolean {
  return role === "admin" || role === "reviewer";
}

export function canReserveProjectMediaUpload(role: Role): boolean {
  return role === "admin";
}

export function canViewProjectMedia(role: Role): boolean {
  return role === "admin" || role === "reviewer";
}

export function canViewProjectMediaOrphanInventory(role: Role): boolean {
  return role === "admin";
}

export function canViewUserAdministration(role: Role | null): boolean {
  return role === "admin";
}

export function canChangeUserRole(role: Role | null): boolean {
  return role === "admin";
}

export function canInviteReviewer(role: Role | null): boolean {
  return role === "admin";
}

export function canClaimProjectMediaOrphan(role: Role): boolean {
  return role === "admin";
}

export function canPurgeProjectMediaOrphan(role: Role): boolean {
  return role === "admin";
}

export function canEditAnyProjectNote(role: Role): boolean {
  return role === "admin";
}

export function canEditOwnProjectNote(role: Role, actorId: string, noteCreatedBy: string): boolean {
  return role === "reviewer" && actorId === noteCreatedBy;
}

export function canSoftDeleteAnyProjectNote(role: Role): boolean {
  return role === "admin";
}

export function canSoftDeleteOwnProjectNote(role: Role, actorId: string, noteCreatedBy: string): boolean {
  return role === "reviewer" && actorId === noteCreatedBy;
}
