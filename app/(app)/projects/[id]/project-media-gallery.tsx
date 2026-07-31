import { Badge } from "@/components/ui";
import React from "react";
import type { ProjectMediaGalleryItem, ProjectMediaGalleryResult } from "@/lib/actions/project-media-gallery-service";
import { ProjectMediaImageLightbox, type ProjectMediaLightboxImage } from "./project-media-image-lightbox";
import { ProjectMediaPdfOpenControl } from "./project-media-pdf-open-control";

const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const sizeFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const TYPE_LABELS: Record<ProjectMediaGalleryItem["mime_type"], string> = {
  "image/jpeg": "JPEG-Bild", "image/png": "PNG-Bild", "image/webp": "WebP-Bild", "application/pdf": "PDF-Dokument",
};

export function formatProjectMediaSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${sizeFormatter.format(bytes / 1_000_000)} MB` : `${sizeFormatter.format(bytes / 1_000)} KB`;
}

function MediaMeta({ item }: { item: ProjectMediaGalleryItem }) {
  return <div className="space-y-3 p-4"><Badge>{item.category_label}</Badge>{item.caption ? <p className="break-words text-sm text-slate-800">{item.caption}</p> : null}<dl className="space-y-1 text-sm text-slate-600"><div><dt className="sr-only">Dateityp</dt><dd>{TYPE_LABELS[item.mime_type]}</dd></div><div><dt className="sr-only">Dateigröße</dt><dd>{formatProjectMediaSize(item.file_size_bytes)}</dd></div><div><dt className="sr-only">Uploaddatum</dt><dd>{dateFormatter.format(new Date(item.created_at))}</dd></div></dl></div>;
}

export function ProjectMediaGallery({ result, isAdmin }: { result: ProjectMediaGalleryResult; isAdmin: boolean }) {
  const images: ProjectMediaLightboxImage[] = result.success ? result.data.items.flatMap((item) => item.display_kind === "image" && item.signed_view_url ? [{ project_id: item.project_id, media_id: item.media_id, category_label: item.category_label, caption: item.caption, preview_url: item.signed_view_url, alt_text: item.caption?.trim() || `Projektmedium, Kategorie ${item.category_label}` }] : []) : [];
  return <section aria-labelledby="project-media-gallery-title" className="space-y-4"><div><h2 className="text-xl font-semibold" id="project-media-gallery-title">Projektmedien</h2><p className="text-sm text-slate-600">Sicher bereitgestellte Bilder und Dokumente dieses Projekts.</p></div>{!result.success ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{result.error}</p> : result.data.items.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-slate-600"><p>Noch keine Projektmedien vorhanden.</p>{isAdmin ? <p className="mt-1">Neue Medien können im Uploadbereich hinzugefügt werden.</p> : null}</div> : <><ul aria-label="Projektmedien" className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.data.items.map((item) => <li className="overflow-hidden rounded-xl border bg-white shadow-sm" key={item.media_id}><div className="aspect-[4/3] bg-slate-100">{item.display_kind === "image" ? item.signed_view_url ? <ProjectMediaImageLightbox images={images} initialMediaId={item.media_id} /> : <p className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-600">Sicherer Zugriff konnte nicht erstellt werden.</p> : <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"><svg aria-hidden="true" className="h-12 w-12 text-red-700" fill="none" viewBox="0 0 48 48"><path d="M12 4h16l8 8v32H12z" stroke="currentColor" strokeWidth="2"/><path d="M28 4v8h8M17 31h14M17 36h10" stroke="currentColor" strokeWidth="2"/></svg><strong>PDF-Dokument</strong><ProjectMediaPdfOpenControl mediaId={item.media_id} projectId={item.project_id} /></div>}</div><MediaMeta item={item} /></li>)}</ul>{result.data.is_limited ? <p className="text-sm text-slate-600">Es werden die neuesten 50 Projektmedien angezeigt.</p> : null}</>}</section>;
}
