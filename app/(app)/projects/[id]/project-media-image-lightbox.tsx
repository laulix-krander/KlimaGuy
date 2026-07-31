"use client";

import { createPortal } from "react-dom";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectMediaImage } from "./project-media-image";
import { createProjectMediaSignedViewUrlAction } from "@/lib/actions/project-media-signed-view-url";

export type ProjectMediaLightboxImage = {
  project_id: string;
  media_id: string;
  category_label: string;
  caption: string | null;
  preview_url: string;
  alt_text: string;
};

type Props = {
  images: ProjectMediaLightboxImage[];
  initialMediaId: string;
};

const focusableSelector = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export function ProjectMediaImageLightbox({ images, initialMediaId }: Props) {
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);

  const requestSignedUrl = useCallback(async (index: number) => {
    const image = images[index];
    if (!image) return;
    const sequence = ++requestSequenceRef.current;
    setSignedUrl(null);
    setActionError(null);
    setImageStatus("loading");
    setUrlLoading(true);
    const result = await createProjectMediaSignedViewUrlAction({ project_id: image.project_id, media_id: image.media_id });
    if (sequence !== requestSequenceRef.current) return;
    setUrlLoading(false);
    if (!result.success) {
      const messages = {
        signed_url_forbidden: "Der Zugriff ist nicht erlaubt.",
        signed_url_not_found: "Das Medium ist nicht mehr verfügbar.",
        signed_url_not_available: "Das Medium ist nicht mehr verfügbar.",
        signed_url_invalid_input: "Die Vorschau konnte nicht erneuert werden.",
        signed_url_failed: "Die Vorschau konnte nicht erneuert werden.",
      } as const;
      setActionError(messages[result.code]);
      return;
    }
    if (result.media_id !== image.media_id) {
      setActionError("Die Vorschau konnte nicht erneuert werden.");
      return;
    }
    setSignedUrl(result.signed_view_url);
  }, [images]);

  const close = useCallback(() => {
    requestSequenceRef.current += 1;
    setSignedUrl(null);
    setActionError(null);
    setUrlLoading(false);
    setImageStatus("loading");
    setCurrentIndex(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  const open = (opener: HTMLButtonElement) => {
    const index = images.findIndex((image) => image.media_id === initialMediaId);
    if (index < 0) return;
    openerRef.current = opener;
    setImageStatus("loading");
    setCurrentIndex(index);
    void requestSignedUrl(index);
  };

  const navigate = useCallback((index: number) => {
    if (index < 0 || index >= images.length) return;
    setCurrentIndex(index);
    void requestSignedUrl(index);
  }, [images.length, requestSignedUrl]);

  useEffect(() => {
    if (currentIndex === null) return;
    const portal = document.createElement("div");
    portal.dataset.projectMediaLightbox = "true";
    document.body.appendChild(portal);
    setPortalElement(portal);
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter((element) => element !== portal);
    const previousInert = background.map((element) => element.hasAttribute("inert"));
    document.body.style.overflow = "hidden";
    background.forEach((element) => element.setAttribute("inert", ""));

    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => {
        if (!previousInert[index]) element.removeAttribute("inert");
      });
      portal.remove();
      setPortalElement(null);
    };
  }, [currentIndex === null]);

  useEffect(() => {
    if (!portalElement) return;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, [portalElement]);

  useEffect(() => {
    if (currentIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentIndex > 0) navigate((currentIndex ?? 0) - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (currentIndex < images.length - 1) navigate((currentIndex ?? 0) + 1);
      } else if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close, currentIndex, images.length, navigate]);

  const currentImage = currentIndex === null ? null : images[currentIndex];
  const dialog = currentImage && portalElement ? createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/90 p-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] [padding-left:max(0.5rem,env(safe-area-inset-left))] [padding-right:max(0.5rem,env(safe-area-inset-right))] [padding-top:max(0.5rem,env(safe-area-inset-top))] sm:p-6"
      data-testid="project-media-lightbox-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div aria-labelledby="project-media-lightbox-title" aria-modal="true" className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" ref={dialogRef} role="dialog">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
          <h2 className="text-lg font-semibold" id="project-media-lightbox-title">Bildansicht Projektmedien</h2>
          <button className="min-h-11 rounded-md px-4 py-2 font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={close} ref={closeButtonRef} type="button">Schließen</button>
        </header>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-900 p-2 sm:p-4">
          {urlLoading ? <p className="text-sm text-white" role="status">Vorschau wird vorbereitet …</p> : null}
          {actionError ? <div className="space-y-3 text-center text-white"><p role="alert">{actionError}</p><button className="min-h-11 rounded-md border border-white px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => void requestSignedUrl(currentIndex ?? 0)} type="button">Erneut versuchen</button></div> : null}
          {signedUrl && imageStatus === "loading" ? <p className="absolute text-sm text-white" role="status">Bild wird geladen …</p> : null}
          {signedUrl && imageStatus === "error" ? <p className="flex min-h-52 items-center justify-center px-4 text-center text-white" role="alert">Das Bild konnte nicht geladen werden.</p> : null}
          {signedUrl && imageStatus !== "error" ? <img alt={currentImage.alt_text} className={`max-h-[65vh] max-w-full object-contain ${imageStatus === "loaded" ? "block" : "invisible"}`} key={`${currentImage.media_id}:${signedUrl}`} onError={() => setImageStatus("error")} onLoad={() => setImageStatus("loaded")} src={signedUrl} /> : null}
        </div>
        <div className="shrink-0 space-y-3 border-t px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button className="min-h-11 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={currentIndex === 0} onClick={() => navigate((currentIndex ?? 0) - 1)} type="button">Vorheriges Bild</button>
            <p className="shrink-0 text-sm font-medium">Bild {(currentIndex ?? 0) + 1} von {images.length}</p>
            <button className="min-h-11 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={currentIndex === images.length - 1} onClick={() => navigate((currentIndex ?? 0) + 1)} type="button">Nächstes Bild</button>
          </div>
          <div className="max-h-24 overflow-y-auto">
            <p className="text-sm font-semibold text-teal-800">{currentImage.category_label}</p>
            {currentImage.caption ? <p className="mt-1 break-words text-sm text-slate-700">{currentImage.caption}</p> : null}
          </div>
        </div>
      </div>
    </div>,
    portalElement,
  ) : null;

  const image = images.find((candidate) => candidate.media_id === initialMediaId);
  if (!image) return null;
  return <>
    <button aria-label={`${image.category_label} in Bildansicht öffnen`} className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={(event) => open(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(event.currentTarget); } }} type="button">
      <ProjectMediaImage alt={image.alt_text} src={image.preview_url} />
    </button>
    {dialog}
  </>;
}
