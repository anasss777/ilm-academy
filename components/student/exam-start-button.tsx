"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { apiErrorKey } from "@/lib/ui/errors";

/**
 * Starts a new attempt, or resumes the one in progress (the server decides which).
 * For a timed exam, starting asks for confirmation first: the clock cannot be paused.
 */
export function ExamStartButton({
  examId,
  courseId,
  resume,
  durationMinutes,
}: {
  examId: string;
  courseId: string;
  resume: boolean;
  durationMinutes?: number | null;
}) {
  const t = useTranslations("exam");
  const te = useTranslations("apiErrors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const needsConfirm = !!durationMinutes && !resume;

  async function start() {
    setBusy(true);
    setErrorCode(null);
    const res = await apiRequest<{ id: string }>("POST", `/api/exams/${examId}/attempts`);
    if (!res.ok) {
      setErrorCode(res.code);
      setBusy(false);
      setConfirming(false);
      return;
    }
    router.push(`/my-courses/${courseId}/exam/attempts/${res.data.id}`);
  }

  return (
    <div className="stack gap-3">
      {confirming && durationMinutes ? (
        <div className="alert-warning stack gap-3" role="alertdialog" aria-labelledby="exam-start-title">
          <p id="exam-start-title" className="font-semibold">{t("startConfirmTitle")}</p>
          <p>{t("startConfirmBody", { minutes: String(durationMinutes) })}</p>
          <div className="cluster gap-3">
            <button type="button" className="btn-primary" onClick={start} disabled={busy}>
              {busy ? t("starting") : t("startConfirmYes")}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {t("startConfirmNo")}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn-primary btn-lg" onClick={needsConfirm ? () => setConfirming(true) : start} disabled={busy}>
            {busy ? t("starting") : resume ? t("continue") : t("start")}
          </button>
        </div>
      )}
      {errorCode ? (
        <p role="alert" className="field-error">
          {te(apiErrorKey(errorCode))}
        </p>
      ) : null}
    </div>
  );
}
