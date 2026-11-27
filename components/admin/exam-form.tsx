"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { fromLocalInput, toLocalInput } from "@/lib/ui/datetime";
import { SelectField, TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

export type ExamInitial = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  opensAt: string | null;
  dueAt: string | null;
  passingPercent: number;
  attemptLimit: number;
  durationMinutes: number | null;
  status: "DRAFT" | "PUBLISHED";
};

/** Create the course's exam, or edit it (including publishing, which needs a published question). */
export function ExamForm({
  mode,
  courseId,
  initial,
  canDelete = false,
}: {
  mode: "create" | "edit";
  courseId: string;
  initial?: ExamInitial;
  canDelete?: boolean;
}) {
  const t = useTranslations("admin.exam");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, saved, run, fail } = useSave();

  const [titleAr, setTitleAr] = useState(initial?.titleAr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.titleEn ?? "");
  const [descAr, setDescAr] = useState(initial?.descriptionAr ?? "");
  const [descEn, setDescEn] = useState(initial?.descriptionEn ?? "");
  const [opensAt, setOpensAt] = useState(() => toLocalInput(initial?.opensAt));
  const [dueAt, setDueAt] = useState(() => toLocalInput(initial?.dueAt));
  const [passing, setPassing] = useState(String(initial?.passingPercent ?? 50));
  const [attempts, setAttempts] = useState(String(initial?.attemptLimit ?? 1));
  const [duration, setDuration] = useState(
    initial?.durationMinutes ? String(initial.durationMinutes) : "",
  );
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(
    initial?.status ?? "DRAFT",
  );
  const [confirming, setConfirming] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pass = Number(passing);
    const limit = Number(attempts);
    if (
      !titleAr.trim() ||
      !Number.isFinite(pass) ||
      !Number.isInteger(limit) ||
      limit < 1
    ) {
      fail({ code: "INVALID_SETTINGS" });
      return;
    }
    // Empty = no time limit per attempt
    const minutes = duration.trim() ? Number(duration) : null;
    if (
      minutes !== null &&
      (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
    ) {
      fail({ code: "INVALID_SETTINGS" });
      return;
    }
    const payload = {
      titleAr: titleAr.trim(),
      titleEn,
      descriptionAr: descAr,
      descriptionEn: descEn,
      opensAt: fromLocalInput(opensAt),
      dueAt: fromLocalInput(dueAt),
      passingPercent: pass,
      attemptLimit: limit,
      durationMinutes: minutes,
    };
    if (mode === "create") {
      await run(
        () =>
          apiRequest("POST", `/api/admin/courses/${courseId}/exam`, payload),
        () => router.refresh(),
      );
    } else {
      await run(
        () =>
          apiRequest("PATCH", `/api/admin/exams/${initial!.id}`, {
            ...payload,
            status,
          }),
        () => router.refresh(),
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack gap-4" noValidate>
      <h2 className="title-card">
        {mode === "create" ? t("createTitle") : t("details")}
      </h2>
      {mode === "create" ? (
        <p className="text-sm text-muted">{t("createHint")}</p>
      ) : null}

      <div className="form-grid">
        <TextField
          id="e-title-ar"
          label={t("titleAr")}
          dir="auto"
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
          required
        />
        <TextField
          id="e-title-en"
          label={t("titleEn")}
          dir="auto"
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
        />
        <TextAreaField
          id="e-desc-ar"
          label={t("descAr")}
          rows={3}
          value={descAr}
          onChange={(e) => setDescAr(e.target.value)}
        />
        <TextAreaField
          id="e-desc-en"
          label={t("descEn")}
          rows={3}
          value={descEn}
          onChange={(e) => setDescEn(e.target.value)}
        />
        <TextField
          id="e-opens"
          label={t("opensAt")}
          hint={t("windowHint")}
          type="datetime-local"
          dir="ltr"
          value={opensAt}
          onChange={(e) => setOpensAt(e.target.value)}
          suppressHydrationWarning
        />
        <TextField
          id="e-due"
          label={t("dueAt")}
          type="datetime-local"
          dir="ltr"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          suppressHydrationWarning
        />
        <TextField
          id="e-pass"
          label={t("passingPercent")}
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="1"
          dir="ltr"
          value={passing}
          onChange={(e) => setPassing(e.target.value)}
        />
        <TextField
          id="e-attempts"
          label={t("attemptLimit")}
          type="number"
          inputMode="numeric"
          min="1"
          max="10"
          step="1"
          dir="ltr"
          value={attempts}
          onChange={(e) => setAttempts(e.target.value)}
        />
        <TextField
          id="e-duration"
          label={t("durationMinutes")}
          hint={t("durationHint")}
          type="number"
          inputMode="numeric"
          min="1"
          max="600"
          step="1"
          dir="ltr"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
        {mode === "edit" ? (
          <SelectField
            id="e-status"
            label={t("status")}
            value={status}
            onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
          >
            <option value="DRAFT">{t("draft")}</option>
            <option value="PUBLISHED">{t("published")}</option>
          </SelectField>
        ) : null}
      </div>

      <ErrorNote error={error} />
      <SavedNote saved={saved && mode === "edit"} />
      <div className="cluster">
        <button type="submit" className="btn-primary" disabled={busy}>
          {mode === "create"
            ? busy
              ? tc("creating")
              : t("create")
            : busy
              ? tc("saving")
              : tc("save")}
        </button>
        {mode === "edit" && canDelete ? (
          confirming ? (
            <>
              <span className="text-sm">{t("deleteConfirm")}</span>
              <button
                type="button"
                className="btn-danger btn-sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      apiRequest("DELETE", `/api/admin/exams/${initial!.id}`),
                    () => router.refresh(),
                  )
                }
              >
                {tc("confirmDelete")}
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
              >
                {tc("cancel")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirming(true)}
            >
              {t("deleteButton")}
            </button>
          )
        ) : null}
      </div>
    </form>
  );
}
