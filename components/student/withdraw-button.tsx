"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";

export function WithdrawButton({ courseId }: { courseId: string }) {
  const t = useTranslations("student");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onConfirm() {
    setBusy(true);
    setFailed(false);
    const res = await apiRequest("DELETE", `/api/courses/${courseId}/enrollment`);
    if (!res.ok) {
      setFailed(true);
      setBusy(false);
      return;
    }
    router.push("/my-courses");
    router.refresh();
  }

  return (
    <section className="card stack gap-3">
      <h2 className="title-card">{t("withdrawTitle")}</h2>
      <p className="text-sm text-muted">{t("withdrawBody")}</p>
      {failed ? <p role="alert" className="alert-error">{t("withdrawFailed")}</p> : null}
      {confirming ? (
        <div className="stack gap-3">
          <p className="text-sm font-medium text-ink">{t("withdrawSure")}</p>
          <div className="cluster">
            <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
              {t("withdrawConfirm")}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {t("withdrawCancel")}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn-outline" onClick={() => setConfirming(true)}>
            {t("withdrawButton")}
          </button>
        </div>
      )}
    </section>
  );
}
