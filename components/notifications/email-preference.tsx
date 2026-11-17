"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiRequest } from "@/lib/client/api";

/** Opt out of (or back into) the email copies of notifications. In-app notifications always stay. */
export function EmailPreference({ initial }: { initial: boolean }) {
  const t = useTranslations("notifications");
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setBusy(true);
    setMessage(null);
    const res = await apiRequest("PUT", "/api/me/notification-preferences", { email: next });
    setBusy(false);
    if (!res.ok) {
      setMessage("failed");
      return;
    }
    setEnabled(next);
    setMessage("saved");
  }

  return (
    <section className="card stack gap-3">
      <h2 className="title-card">{t("emailTitle")}</h2>
      <p className="text-sm text-muted">{t("emailBody")}</p>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="checkbox mt-1" checked={enabled} onChange={onChange} disabled={busy} />
        <span className="text-sm">{t("emailLabel")}</span>
      </label>
      {message === "saved" ? <p role="status" className="text-sm text-success">{t("emailSaved")}</p> : null}
      {message === "failed" ? <p role="alert" className="field-error">{t("emailFailed")}</p> : null}
    </section>
  );
}
