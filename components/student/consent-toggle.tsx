"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";

/** Consent to share data with the certificate organization (grant or withdraw at any time). */
export function ConsentToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("progress");
  const router = useRouter();
  const [granted, setGranted] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setBusy(true);
    setMessage(null);
    const res = await apiRequest("PUT", "/api/me/consent", { granted: next });
    setBusy(false);
    if (!res.ok) {
      setMessage("failed");
      return;
    }
    setGranted(next);
    setMessage("saved");
    router.refresh();
  }

  return (
    <div className="stack gap-2">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="checkbox mt-1" checked={granted} onChange={onChange} disabled={busy} />
        <span className="text-sm">{t("consentLabel")}</span>
      </label>
      {message === "saved" ? <p className="text-sm text-success">{t("consentSaved")}</p> : null}
      {message === "failed" ? <p role="alert" className="field-error">{t("consentFailed")}</p> : null}
    </div>
  );
}
