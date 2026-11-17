"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

export function LectureDeleteButton({ courseId, lectureId }: { courseId: string; lectureId: string }) {
  const t = useTranslations("admin.lectures");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useSave();

  return (
    <section className="card stack gap-3">
      {confirming ? (
        <>
          <p className="text-sm font-medium text-ink">{t("deleteConfirm")}</p>
          <div className="cluster">
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() =>
                run(
                  () => apiRequest("DELETE", `/api/admin/lectures/${lectureId}`),
                  () => router.push(`/admin/courses/${courseId}/lectures`),
                )
              }
            >
              {tc("confirmDelete")}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {tc("cancel")}
            </button>
          </div>
        </>
      ) : (
        <div>
          <button type="button" className="btn-outline" onClick={() => setConfirming(true)}>
            {t("deleteButton")}
          </button>
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}
