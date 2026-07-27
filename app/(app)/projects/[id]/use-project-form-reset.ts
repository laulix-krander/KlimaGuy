"use client";

import { useEffect, useRef } from "react";

export function useProjectFormReset(success: boolean, onSuccess?: () => void) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!success) return;

    formRef.current?.reset();
    onSuccess?.();
  }, [onSuccess, success]);

  return formRef;
}
