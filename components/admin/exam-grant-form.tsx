"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { fromLocalInput } from "@/lib/ui/datetime";
import { TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

/** Reopen the exam for one student: extra attempts and/or a new deadline (instructors only). */
export function ExamGrantForm({ examId, userId }: { examId: string; userId: string }) {
  const t = useTranslations("admin.grading");
  const router = useRouter();
  const { busy, error, saved, run, fail } = useSave();
  const [extra, setExtra] = useState("1");
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Number(extra || 0);
    const newDueAt = fromLocalInput(due);
    if (!Number.isInteger(n) || n < 0 || (n === 0 && !newDueAt)) {
      fail({ code: "INVALID_ATTEMPT_GRANT" });
      return;
    }
    await run(
      () =>
        apiRequest("POST", `/api/exams/${examId}/grants`, {
          userId,
          extraAttempts: n,
          newDueAt,
          reason: reason.trim() || null,
        }),
      () => router.refresh(),
    );
  }

  return (
    <form onSubmit={onSubmit} className="card stack gap-3" noValidate>
      <h2 className="title-card">{t("grantTitle")}</h2>
      <div className="form-grid">
        <TextField id="grant-extra" label={t("extraAttempts")} type="number" inputMode="numeric" min="0" max="10" step="1" dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <TextField id="grant-due" label={t("grantDue")} type="datetime-local" dir="ltr" value={due} onChange={(e) => setDue(e.target.value)} suppressHydrationWarning />
      </div>
      <TextField id="grant-reason" label={t("reason")} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} />
      <ErrorNote error={error} />
      <SavedNote saved={saved} text={t("granted")} />
      <div>
        <button type="submit" className="btn-outline" disabled={busy}>
          {t("grant")}
        </button>
      </div>
    </form>
  );
}
