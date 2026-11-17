"use client";

import { useState } from "react";
import type { ApiResult } from "@/lib/client/api";

export type SaveError = { code: string; message?: string };

/** Busy / error / saved state around one API call, so every admin form behaves the same. */
export function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const [saved, setSaved] = useState(false);

  async function run<T>(fn: () => Promise<ApiResult<T>>, onOk?: (data: T) => void): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError({ code: res.code, message: res.message });
      return false;
    }
    setSaved(true);
    onOk?.(res.data);
    return true;
  }

  return { busy, error, saved, run, fail: setError };
}
