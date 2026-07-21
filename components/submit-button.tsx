"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

export function SubmitButton({ children, pendingLabel = "Bitte warten …", className }: { children: React.ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} className={className}>{pending ? pendingLabel : children}</Button>;
}
