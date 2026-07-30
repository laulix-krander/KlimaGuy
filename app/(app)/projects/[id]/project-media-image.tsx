"use client";

import { useState } from "react";
import React from "react";

export function ProjectMediaImage({ alt, src }: { alt: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-600">Vorschau konnte nicht geladen werden.</p>;
  return <img alt={alt} className="h-full w-full object-cover" height={600} loading="lazy" onError={() => setFailed(true)} src={src} width={800} />;
}
