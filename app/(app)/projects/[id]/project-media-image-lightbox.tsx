"use client";

import { createPortal } from "react-dom";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectMediaImage } from "./project-media-image";

export type ProjectMediaLightboxImage = {
  media_id: string;
  category_label: string;
  caption: string | null;
  signed_view_url: string;
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
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setCurrentIndex(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  const open = (opener: HTMLButtonElement) => {
    const index = images.findIndex((image) => image.media_id === initialMediaId);
    if (index < 0) return;
    openerRef.current = opener;
    setImageStatus("loading");
    setCurrentIndex(index);
  };

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
    setImageStatus("loading");
  }, [currentIndex]);

  useEffect(() => {
    if (currentIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentIndex((index) => index !== null && index > 0 ? index - 1 : index);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentIndex((index) => index !== null && index < images.length - 1 ? index + 1 : index);
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
  }, [close, currentIndex, images.length]);

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
          {imageStatus === "loading" ? <p className="absolute text-sm text-white" role="status">Bild wird geladen …</p> : null}
          {imageStatus === "error" ? <p className="flex min-h-52 items-center justify-center px-4 text-center text-white" role="alert">Das Bild konnte nicht geladen werden.</p> : <img alt={currentImage.alt_text} className={`max-h-[65vh] max-w-full object-contain ${imageStatus === "loaded" ? "block" : "invisible"}`} key={currentImage.media_id} onError={() => setImageStatus("error")} onLoad={() => setImageStatus("loaded")} src={currentImage.signed_view_url} />}
        </div>
        <div className="shrink-0 space-y-3 border-t px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button className="min-h-11 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => index !== null && index > 0 ? index - 1 : index)} type="button">Vorheriges Bild</button>
            <p className="shrink-0 text-sm font-medium">Bild {(currentIndex ?? 0) + 1} von {images.length}</p>
            <button className="min-h-11 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={currentIndex === images.length - 1} onClick={() => setCurrentIndex((index) => index !== null && index < images.length - 1 ? index + 1 : index)} type="button">Nächstes Bild</button>
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
      <ProjectMediaImage alt={image.alt_text} src={image.signed_view_url} />
    </button>
    {dialog}
  </>;
}
