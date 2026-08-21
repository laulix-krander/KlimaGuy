import { describe, expect, it } from "vitest";
import { deriveProjectMediaDependencies, MEDIA_DEPENDENCY_PROJECTION_VERSION, type MediaDependencyProjectionInput } from "@/lib/domain/project-media-dependency-projection";

const base = (evidence: Partial<MediaDependencyProjectionInput["evidence"][number]> = {}): MediaDependencyProjectionInput => ({
  project_id: "11111111-1111-4111-8111-111111111111", project_media_id: "22222222-2222-4222-8222-222222222222", media_available: true,
  evidence: [{ id: "33333333-3333-4333-8333-333333333333", interpretation_runs: [], observations: [], proposals: [], has_applied_claim: false, ...evidence }],
});
const source = { id: "44444444-4444-4444-8444-444444444444", revision: 1 };

describe("deriveProjectMediaDependencies", () => {
  it.each(["pending", "in_progress"] as const)("projects %s interpretation as open", (status) => {
    const input = base({ interpretation_runs: [{ ...source, status, result_code: null }] });
    expect(deriveProjectMediaDependencies(input).dependencies[0]).toMatchObject({ status: "open", reason_codes: ["interpretation_pending"] });
  });
  it("keeps failed interpretation retryable and resolves completed insufficient evidence", () => {
    const input = base({ interpretation_runs: [
      { ...source, status: "failed", result_code: "persistence_failed" },
      { id: "55555555-5555-4555-8555-555555555555", revision: 2, status: "insufficient_evidence", result_code: "insufficient_evidence" },
    ] });
    const result = deriveProjectMediaDependencies(input);
    expect(result.dependencies.map((item) => [item.status, item.reason_codes])).toEqual([["open", ["interpretation_retry_required"]], ["resolved", []]]);
  });
  it("opens only active claimable observations without a proposal", () => {
    const input = base({ observations: [
      { ...source, status: "recorded", claimable: true, proposal_id: null },
      { id: "55555555-5555-4555-8555-555555555555", revision: 1, status: "recorded", claimable: false, proposal_id: null },
      { id: "66666666-6666-4666-8666-666666666666", revision: 1, status: "invalidated", claimable: true, proposal_id: null },
    ] });
    expect(deriveProjectMediaDependencies(input).dependencies.map((item) => item.status)).toEqual(["open", "resolved", "invalidated"]);
  });
  it.each([
    ["pending_review", "open"], ["approved_apply_pending", "open"], ["applied", "resolved"],
    ["rejected", "resolved"], ["insufficient_evidence", "resolved"], ["superseded", "invalidated"],
  ] as const)("maps proposal %s", (status, expected) => {
    const input = base({ proposals: [{ ...source, observation_id: "77777777-7777-4777-8777-777777777777", status }] });
    expect(deriveProjectMediaDependencies(input).dependencies.find((item) => item.dependency_type === "claim_proposal_review")?.status).toBe(expected);
  });
  it("resolves successful/no-change apply and keeps retryable apply failure open", () => {
    const input = base({ proposals: [
      { ...source, observation_id: "77777777-7777-4777-8777-777777777777", status: "applied", apply_result: "no_change" },
      { id: "55555555-5555-4555-8555-555555555555", revision: 3, observation_id: "88888888-8888-4888-8888-888888888888", status: "approved_apply_pending", apply_result: "retryable_failure" },
    ] });
    expect(deriveProjectMediaDependencies(input).dependencies.filter((item) => item.dependency_type === "claim_apply").map((item) => [item.status, item.reason_codes])).toEqual([["resolved", []], ["open", ["claim_apply_retry_required"]]]);
  });
  it("always exposes unavailable correction, offer and execution authorities", () => {
    const result = deriveProjectMediaDependencies(base());
    expect(result).toMatchObject({ projection_version: MEDIA_DEPENDENCY_PROJECTION_VERSION, completeness: "complete", missing_authority_types: ["correction", "offer", "execution"], reason_codes: ["correction_authority_missing", "offer_authority_missing", "execution_authority_missing"] });
  });
  it("is deterministic and does not mutate input", () => {
    const input = base({ interpretation_runs: [{ ...source, status: "pending", result_code: null }] });
    const before = structuredClone(input); const first = deriveProjectMediaDependencies(input); const second = deriveProjectMediaDependencies(input);
    expect(first).toEqual(second); expect(input).toEqual(before);
  });
  it("fails completeness closed for unavailable media and inconsistent sources", () => {
    const input = { ...base({ observations: [{ ...source, status: "recorded", claimable: true, proposal_id: "99999999-9999-4999-8999-999999999999" }] }), media_available: false };
    expect(deriveProjectMediaDependencies(input)).toMatchObject({ completeness: "incomplete", reason_codes: expect.arrayContaining(["source_media_unavailable", "source_record_inconsistent", "projection_incomplete"]) });
  });
});
