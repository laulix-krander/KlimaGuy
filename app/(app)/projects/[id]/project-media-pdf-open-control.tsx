"use client";

import React, { useRef, useState } from "react";
import { createProjectMediaSignedViewUrlAction } from "@/lib/actions/project-media-signed-view-url";

export function ProjectMediaPdfOpenControl({ projectId, mediaId }: { projectId: string; mediaId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const open = async () => {
    if (pendingRef.current) return;
    const reservedWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!reservedWindow) {
      setError("Das Dokument konnte nicht geöffnet werden. Bitte erlaube Pop-ups für diese Seite.");
      return;
    }
    reservedWindow.opener = null;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const result = await createProjectMediaSignedViewUrlAction({ project_id: projectId, media_id: mediaId });
    pendingRef.current = false;
    setPending(false);
    if (!result.success || result.media_id !== mediaId) {
      reservedWindow.close();
      setError("Das Dokument konnte nicht geöffnet werden.");
      return;
    }
    reservedWindow.location.replace(result.signed_view_url);
  };

  return <div className="space-y-2">
    <button aria-disabled={pending} className="rounded-md px-3 py-2 text-sm font-medium text-teal-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} onClick={() => void open()} type="button">
      {pending ? "Dokument wird geöffnet …" : "PDF sicher ansehen (öffnet neuen Tab)"}
    </button>
    {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
  </div>;
}
