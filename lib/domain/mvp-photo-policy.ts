import type { MvpProjectFact } from "./mvp-project-facts";
import { MVP_REQUIRED_PHOTO_CATEGORIES } from "./mvp-project-facts";

export const MVP_CORE_PHOTO_CATEGORIES = ["room_overview", "indoor_unit_location", "outdoor_unit_location"] as const;
export type MvpPhotoCategory = (typeof MVP_REQUIRED_PHOTO_CATEGORIES)[number];
export type MvpPhotoCoverageMedia = Readonly<{ project_id: string; category: string; media_type: string; mime_type: string; upload_status: string; deleted_at: string | null }>;

export function deriveSituationalPhotoCategories(facts: readonly MvpProjectFact[]): MvpPhotoCategory[] {
  const values = new Map(facts.map((fact) => [fact.key, fact.value]));
  const required: MvpPhotoCategory[] = [];
  if (!values.has("line_route")) required.push("pipe_route");
  if (["available", "unknown", "requires_site_check"].includes(String(values.get("electrical_supply")))) required.push("electrical_connection");
  if (["unknown", "requires_site_check"].includes(String(values.get("condensate_drainage")))) required.push("condensate_route");
  return required;
}

export function deriveMissingMvpPhotoCategories(
  facts: readonly MvpProjectFact[],
  coveredCategories: readonly MvpPhotoCategory[],
) {
  const covered = new Set(coveredCategories);
  const situational = deriveSituationalPhotoCategories(facts);
  const missingCore = MVP_CORE_PHOTO_CATEGORIES.filter((category) => !covered.has(category));
  const missingSituational = situational.filter((category) => !covered.has(category));
  return { missingCore, missingSituational } as const;
}

export function evaluateMvpPhotoReadiness(projectId: string, facts: readonly MvpProjectFact[], media: readonly MvpPhotoCoverageMedia[]) {
  const covered = new Set<MvpPhotoCategory>();
  for (const item of media) {
    if (item.project_id === projectId && item.upload_status === "ready" && item.deleted_at === null && item.media_type === "image" && ["image/jpeg", "image/png", "image/webp"].includes(item.mime_type) && MVP_REQUIRED_PHOTO_CATEGORIES.includes(item.category as MvpPhotoCategory)) covered.add(item.category as MvpPhotoCategory);
  }
  const situational = deriveSituationalPhotoCategories(facts);
  const { missingCore, missingSituational } = deriveMissingMvpPhotoCategories(facts, [...covered]);
  return {
    covered: [...covered],
    required: [...MVP_CORE_PHOTO_CATEGORIES, ...situational],
    missingCore,
    missingSituational,
    coreReady: missingCore.length === 0,
    ready: missingCore.length === 0 && missingSituational.length === 0,
  } as const;
}

export const MVP_PHOTO_LABELS: Record<MvpPhotoCategory, string> = {
  room_overview: "Raumübersicht", indoor_unit_location: "Position Innengerät", outdoor_unit_location: "Position Außengerät",
  pipe_route: "Leitungsweg", electrical_connection: "Elektroanschluss", condensate_route: "Kondensatweg",
};
