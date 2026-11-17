"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { apiErrorKey } from "@/lib/ui/errors";

/** Starts a new attempt, or resumes the one in progress (the server decides which). */
export function ExamStartButton({
  examId,
  courseId,
  resume,
}: {
  examId: string;
  courseId: string;
  resume: boolean;
}) {
  const t = useTranslations("exam");
  const te = useTranslations("apiErrors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErrorCode(null);
    const res = await apiRequest<{ id: string }>("POST", `/api/exams/${examId}/attempts`);
    if (!res.ok) {
      setErrorCode(res.code);
      setBusy(false);
      return;
    }
    router.push(`/my-courses/${courseId}/exam/attempts/${res.data.id}`);
  }

  return (
    <div className="stack gap-2">
      <button type="button" className="btn-primary btn-lg" onClick={onClick} disabled={busy}>
        {busy ? t("starting") : resume ? t("continue") : t("start")}
      </button>
      {errorCode ? (
        <p role="alert" className="field-error">
          {te(apiErrorKey(errorCode))}
        </p>
      ) : null}
    </div>
  );
}
