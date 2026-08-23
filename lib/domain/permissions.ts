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

/** AP-15-05-01 keeps classification of real media at the admin boundary. */
export function canBindProjectMediaAsEvidence(role: Role | null): boolean {
  return role === "admin";
}

/** Lifecycle decisions are deliberately narrower than normal media viewing. */
export function canManageProjectMediaLifecycle(role: Role | null): boolean {
  return role === "admin";
}

/** Offer lifecycle authority is an admin-only responsibility in the MVP. */
export function canManageProjectOffers(role: Role | null): boolean {
  return role === "admin";
}

/** Execution lifecycle is a separate, admin-only workflow authority. */
export function canManageProjectExecution(role: Role | null): boolean {
  return role === "admin";
}

/** Physical deletion is an explicit, stronger admin-only capability. */
export function canExecuteProjectMediaDeletion(role: Role | null): boolean {
  return role === "admin";
}

/** Persistent evidence claim review is deliberately independent from media capabilities. */
export function canReviewEvidenceClaimProposal(role: Role | null): boolean {
  return role === "admin";
}

/** Apply remains deferred, but its future boundary is explicitly admin-only. */
export function canApplyReviewedEvidenceClaim(role: Role | null): boolean {
  return role === "admin";
}

/** Independent correction capabilities; an admin role is never an implicit reviewer override. */
export function canInvalidateProjectEvidence(role: Role | null): boolean { return role === "admin"; }
export function canCorrectEvidenceObservation(role: Role | null): boolean { return role === "admin"; }
export function canCorrectProjectKnowledgeClaim(role: Role | null): boolean { return role === "admin"; }
/** Intentionally closed until a separately audited stronger capability exists. */
export function canOverrideReviewerProtectedKnowledgeClaim(_role: Role | null): boolean { return false; }

export function canViewProjectMediaOrphanInventory(role: Role): boolean {
  return role === "admin";
}

export function canViewUserAdministration(role: Role | null): boolean {
  return role === "admin";
}

/** Grants access to the transient, synthetic conversation simulator. */
export function canUseConversationSimulator(role: Role | null): boolean {
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
