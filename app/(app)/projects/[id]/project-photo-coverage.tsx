import React from "react";
import { MVP_CORE_PHOTO_CATEGORIES, MVP_PHOTO_LABELS, evaluateMvpPhotoReadiness, type MvpPhotoCategory } from "@/lib/domain/mvp-photo-policy";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";
import type { ProjectMediaGalleryItem } from "@/lib/actions/project-media-gallery-service";
import type { ProjectEvidenceDto } from "@/lib/domain/conversation-intelligence/project-evidence";

function CoverageList({ categories, covered, reviewed, required }: { categories: readonly MvpPhotoCategory[]; covered: ReadonlySet<string>; reviewed: ReadonlySet<string>; required: ReadonlySet<string> }) {
  return <ul className="mt-3 grid gap-2 sm:grid-cols-3">{categories.map((category) => { const exists = covered.has(category); const isRequired = required.has(category); return <li className={`rounded-lg border p-3 text-sm ${exists ? "border-emerald-200 bg-emerald-50" : isRequired ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`} key={category}><span aria-hidden="true">{exists ? "✓" : isRequired ? "!" : "○"}</span> <strong>{MVP_PHOTO_LABELS[category]}</strong><span className="mt-1 block text-xs text-slate-600">{exists ? reviewed.has(category) ? "Vorhanden · menschlich als Evidence gebunden" : "Vorhanden · technische Prüfung offen" : isRequired ? "Erforderlich · fehlt" : "Aktuell nicht erforderlich"}</span></li>; })}</ul>;
}

export function ProjectPhotoCoverage({ media, facts, evidenceByMediaId = {} }: { media: readonly ProjectMediaGalleryItem[]; facts: readonly MvpProjectFact[]; evidenceByMediaId?: Record<string, ProjectEvidenceDto[]> }) {
  const photoReadiness = evaluateMvpPhotoReadiness(media[0]?.project_id ?? "", facts, media.map((item) => ({ ...item, upload_status: "ready", deleted_at: null })));
  const covered = new Set(photoReadiness.covered);
  const required = new Set(photoReadiness.required);
  const images = media.filter((item) => item.media_type === "image");
  const reviewed = new Set(images.filter((item) => (evidenceByMediaId[item.media_id] ?? []).some((evidence) => evidence.binding_status === "bound")).map((item) => item.category));
  return <section aria-labelledby="photo-coverage-title" className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-lg font-semibold" id="photo-coverage-title">Fotoabdeckung</h3><p className="text-sm text-slate-600">Bilder unterstützen die technische Prüfung, ersetzen aber keine Vor-Ort-Prüfung oder Freigabe.</p><h4 className="mt-4 font-semibold">Kernfotos · erforderlich</h4><CoverageList categories={MVP_CORE_PHOTO_CATEGORIES} covered={covered} reviewed={reviewed} required={required} /><h4 className="mt-5 font-semibold">Zusatzfotos · situativ</h4><CoverageList categories={["pipe_route", "electrical_connection", "condensate_route"]} covered={covered} reviewed={reviewed} required={required} /></section>;
}
