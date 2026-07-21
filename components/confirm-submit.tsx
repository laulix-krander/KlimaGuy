"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmit({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{pending ? "Bitte warten …" : children}</button>;
}
