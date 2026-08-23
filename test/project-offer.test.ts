import { describe, expect, it } from "vitest";
import { canManageProjectOffers } from "@/lib/domain/permissions";
import { isProjectOfferTransitionAllowed, offerDependencyState, projectOfferDtoSchema } from "@/lib/domain/project-offer";
import { deriveProjectMediaDependencies } from "@/lib/domain/project-media-dependency-projection";

describe("minimal persistent offer authority", () => {
  it("keeps the mutation boundary admin-only", () => {
    expect(canManageProjectOffers("admin")).toBe(true);
    expect(canManageProjectOffers("reviewer")).toBe(false);
    expect(canManageProjectOffers(null)).toBe(false);
  });
  it("allows only the closed lifecycle", () => {
    expect(isProjectOfferTransitionAllowed("draft", "created")).toBe(true);
    expect(isProjectOfferTransitionAllowed("created", "sent")).toBe(true);
    expect(isProjectOfferTransitionAllowed("sent", "accepted")).toBe(true);
    expect(isProjectOfferTransitionAllowed("sent", "rejected")).toBe(true);
    expect(isProjectOfferTransitionAllowed("accepted", "draft")).toBe(false);
    expect(isProjectOfferTransitionAllowed("rejected", "sent")).toBe(false);
    expect(isProjectOfferTransitionAllowed("superseded", "created")).toBe(false);
  });
  it("maps preparation and open dependencies conservatively", () => {
    expect(offerDependencyState("draft")).toEqual({ preparationOpen: true, offerOpen: false });
    expect(offerDependencyState("created")).toEqual({ preparationOpen: false, offerOpen: true });
    expect(offerDependencyState("sent")).toEqual({ preparationOpen: false, offerOpen: true });
    expect(offerDependencyState("accepted")).toEqual({ preparationOpen: false, offerOpen: false });
    expect(offerDependencyState("rejected")).toEqual({ preparationOpen: false, offerOpen: false });
  });
  it("rejects DTO additions such as prices or PII", () => {
    const base = { id: crypto.randomUUID(), project_id: crypto.randomUUID(), offer_version: 1, revision: 1, status: "draft", supersedes_offer_id: null, created_at: "2026-08-23T00:00:00Z", offer_created_at: null, sent_at: null, accepted_at: null, rejected_at: null, updated_at: "2026-08-23T00:00:00Z" };
    expect(projectOfferDtoSchema.safeParse(base).success).toBe(true);
    expect(projectOfferDtoSchema.safeParse({ ...base, price: 1 }).success).toBe(false);
  });
  it.each(["created", "sent"] as const)("keeps new evidence protected by an open %s offer", (status) => {
    const result = deriveProjectMediaDependencies({ project_id: crypto.randomUUID(), project_media_id: crypto.randomUUID(), media_available: true, current_offer: { id: crypto.randomUUID(), revision: 2, status }, evidence: [{ id: crypto.randomUUID(), interpretation_runs: [], observations: [], proposals: [], has_applied_claim: false }] });
    expect(result.missing_authority_types).toEqual(["execution"]);
    expect(result.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ dependency_type: "offer_open", status: "open" })]));
  });
});
