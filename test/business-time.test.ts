import { describe, expect, it } from "vitest";
import { BUSINESS_TIME_ZONE, formatBusinessDateTime } from "@/lib/domain/business-time";
describe("Business timezone", () => {
  it("uses the explicit Berlin timezone", () => expect(BUSINESS_TIME_ZONE).toBe("Europe/Berlin"));
  it("converts summer UTC to CEST", () => expect(formatBusinessDateTime("2026-07-15T22:30:00Z")).toContain("00:30"));
  it("converts winter UTC to CET", () => expect(formatBusinessDateTime("2026-01-15T22:30:00Z")).toContain("23:30"));
  it("moves a summer timestamp across the date boundary", () => expect(formatBusinessDateTime("2026-07-15T23:30:00Z")).toMatch(/16\.07\.2026.*01:30/));
});
