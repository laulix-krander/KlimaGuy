import { MVP_CORE_PHOTO_CATEGORIES, MVP_PHOTO_LABELS, deriveSituationalPhotoCategories, type MvpPhotoCategory } from "@/lib/domain/mvp-photo-policy";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";
import type { ProjectMediaGalleryItem } from "@/lib/actions/project-media-gallery-service";
import type { ProjectEvidenceDto } from "@/lib/domain/conversation-intelligence/project-evidence";

function CoverageList({ categories, covered, reviewed, optional = false }: { categories: readonly MvpPhotoCategory[]; covered: ReadonlySet<string>; reviewed: ReadonlySet<string>; optional?: boolean }) {
  return <ul className="mt-3 grid gap-2 sm:grid-cols-3">{categories.map((category) => { const exists = covered.has(category); return <li className={`rounded-lg border p-3 text-sm ${exists ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`} key={category}><span aria-hidden="true">{exists ? "✓" : "○"}</span> <strong>{MVP_PHOTO_LABELS[category]}</strong><span className="mt-1 block text-xs text-slate-600">{exists ? reviewed.has(category) ? "Vorhanden · menschlich als Evidence gebunden" : "Vorhanden · technische Prüfung offen" : optional ? "Falls für diesen Fall hilfreich" : "Fehlt"}</span></li>; })}</ul>;
}

export function ProjectPhotoCoverage({ media, facts, evidenceByMediaId = {} }: { media: readonly ProjectMediaGalleryItem[]; facts: readonly MvpProjectFact[]; evidenceByMediaId?: Record<string, ProjectEvidenceDto[]> }) {
  const images = media.filter((item) => item.media_type === "image");
  const covered = new Set(images.map((item) => item.category));
  const reviewed = new Set(images.filter((item) => (evidenceByMediaId[item.media_id] ?? []).some((evidence) => evidence.binding_status === "bound")).map((item) => item.category));
  const useful = deriveSituationalPhotoCategories(facts);
  const extra = (["pipe_route", "electrical_connection", "condensate_route"] as const).filter((category) => useful.includes(category));
  return <section aria-labelledby="photo-coverage-title" className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-lg font-semibold" id="photo-coverage-title">Fotoabdeckung</h3><p className="text-sm text-slate-600">Bilder unterstützen die technische Prüfung, ersetzen aber keine Vor-Ort-Prüfung oder Freigabe.</p><h4 className="mt-4 font-semibold">Kernfotos · erforderlich</h4><CoverageList categories={MVP_CORE_PHOTO_CATEGORIES} covered={covered} reviewed={reviewed} /><h4 className="mt-5 font-semibold">Zusatzfotos · situativ nützlich</h4>{extra.length ? <CoverageList categories={extra} covered={covered} reviewed={reviewed} optional /> : <p className="mt-2 text-sm text-slate-600">Aktuell sind keine zusätzlichen Fotomotive aus den Projektangaben abgeleitet.</p>}</section>;
}
