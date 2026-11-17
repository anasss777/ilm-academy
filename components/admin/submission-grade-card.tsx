"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { fromLocalInput } from "@/lib/ui/datetime";
import { SelectField, TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

type PenaltyType = "NONE" | "PERCENT" | "POINTS";

export type SubmissionCardData = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  questionId: string;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";
  questionBody: string;
  lectureLabel: string | null;
  points: number;
  submittedAtText: string;
  isLate: boolean;
  excuseGranted: boolean;
  excuseReason: string | null;
  answerText: string | null;
  selectedOptionText: string | null;
  selectedOptionCorrect: boolean | null;
  rawScore: number | null;
  finalScore: number | null;
  penaltyType: PenaltyType;
  penaltyValue: number;
  feedback: string | null;
  graded: boolean;
  released: boolean;
};

/**
 * One student's answer: read it, give a score (with the late deduction when it applies),
 * optionally excuse the deduction or reopen/extend the deadline for this student.
 */
export function SubmissionGradeCard({
  data,
  defaults,
  canGrade,
  canExtend,
}: {
  data: SubmissionCardData;
  defaults: { penaltyType: PenaltyType; penaltyValue: number };
  canGrade: boolean;
  canExtend: boolean;
}) {
  const t = useTranslations("admin.grading");
  const tq = useTranslations("admin.questions");
  const router = useRouter();

  const grade = useSave();
  const excuse = useSave();
  const extend = useSave();

  const [raw, setRaw] = useState(data.rawScore != null ? String(data.rawScore) : "");
  const [penaltyType, setPenaltyType] = useState<PenaltyType>(data.graded ? data.penaltyType : defaults.penaltyType);
  const [penaltyValue, setPenaltyValue] = useState(String(data.graded ? data.penaltyValue : defaults.penaltyValue));
  const [feedback, setFeedback] = useState(data.feedback ?? "");
  const [release, setRelease] = useState(true);
  const [reason, setReason] = useState(data.excuseReason ?? "");
  const [newDue, setNewDue] = useState("");
  const [extReason, setExtReason] = useState("");
  const [reopen, setReopen] = useState(false);

  const penaltyApplies = data.isLate && !data.excuseGranted;

  async function onGrade(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const score = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(score)) {
      grade.fail({ code: "SCORE_OUT_OF_RANGE" });
      return;
    }
    await grade.run(
      () =>
        apiRequest("PUT", `/api/submissions/${data.id}/grade`, {
          rawScore: score,
          feedback: feedback.trim() || null,
          ...(data.isLate ? { penaltyType, penaltyValue: Number(penaltyValue || 0) } : {}),
          release,
        }),
      () => router.refresh(),
    );
  }

  return (
    <article className="card stack gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="stack gap-0.5">
          <span className="font-semibold text-ink" dir="auto">{data.studentName}</span>
          <span className="text-xs text-muted" dir="ltr">{data.studentEmail}</span>
        </div>
        <div className="cluster gap-2">
          {data.lectureLabel ? <span className="badge-muted">{data.lectureLabel}</span> : null}
          <span className="badge-primary">{tq(`types.${data.questionType}`)}</span>
          {data.isLate ? <span className="badge-warning">{t("late")}</span> : null}
          {data.excuseGranted ? <span className="badge-info">{t("excused")}</span> : null}
          {data.graded ? <span className="badge-success">{t("gradedBadge")}</span> : null}
        </div>
      </header>

      <p className="prose-block text-sm text-muted" dir="auto">{data.questionBody}</p>

      <div className="stack gap-1">
        <p className="text-sm font-semibold text-ink">{t("answer")}</p>
        {data.questionType === "OPEN" ? (
          <p className="prose-block panel" dir="auto">{data.answerText || "—"}</p>
        ) : (
          <p className="panel flex flex-wrap items-center gap-2" dir="auto">
            <span>{data.selectedOptionText ?? "—"}</span>
            {data.selectedOptionCorrect != null ? (
              <span className={data.selectedOptionCorrect ? "badge-success" : "badge-danger"}>
                {data.selectedOptionCorrect ? t("correctChoice") : t("wrongChoice")}
              </span>
            ) : null}
          </p>
        )}
        <p className="text-xs text-muted">{t("submitted", { date: data.submittedAtText })}</p>
      </div>

      {canGrade ? (
        <form onSubmit={onGrade} className="stack gap-3 border-t border-line pt-4" noValidate>
          <div className="form-grid">
            <TextField
              id={`g-raw-${data.id}`}
              label={t("rawScore", { max: String(data.points) })}
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              max={String(data.points)}
              dir="ltr"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            {data.isLate ? (
              <>
                <SelectField id={`g-pt-${data.id}`} label={t("penaltyType")} value={penaltyType} onChange={(e) => setPenaltyType(e.target.value as PenaltyType)} disabled={!penaltyApplies}>
                  {(["NONE", "PERCENT", "POINTS"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`penaltyTypes.${k}`)}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id={`g-pv-${data.id}`}
                  label={t("penaltyValue")}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  dir="ltr"
                  disabled={!penaltyApplies || penaltyType === "NONE"}
                  value={penaltyValue}
                  onChange={(e) => setPenaltyValue(e.target.value)}
                />
              </>
            ) : null}
          </div>
          <TextAreaField id={`g-fb-${data.id}`} label={t("feedback")} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} />
            {t("release")}
          </label>
          <ErrorNote error={grade.error} />
          <SavedNote saved={grade.saved} text={t("savedGrade")} />
          <div className="cluster">
            <button type="submit" className="btn-primary" disabled={grade.busy}>
              {grade.busy ? t("saving") : t("save")}
            </button>
            {data.finalScore != null ? <span className="text-sm text-muted">{t("finalScore", { score: String(data.finalScore) })}</span> : null}
          </div>
        </form>
      ) : null}

      {canExtend ? (
        <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
          {data.isLate ? (
            <div className="stack gap-2">
              <p className="text-sm font-semibold text-ink">{t("excuseTitle")}</p>
              <TextField id={`x-reason-${data.id}`} label={t("excuseReason")} value={reason} onChange={(e) => setReason(e.target.value)} dir="auto" />
              <ErrorNote error={excuse.error} />
              <div className="cluster">
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={excuse.busy}
                  onClick={() =>
                    excuse.run(
                      () => apiRequest("PUT", `/api/submissions/${data.id}/excuse`, { granted: !data.excuseGranted, reason: data.excuseGranted ? null : reason }),
                      () => router.refresh(),
                    )
                  }
                >
                  {data.excuseGranted ? t("revokeExcuse") : t("grantExcuse")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="stack gap-2">
            <p className="text-sm font-semibold text-ink">{t("extendTitle")}</p>
            <TextField id={`e-due-${data.id}`} label={t("newDueAt")} type="datetime-local" dir="ltr" value={newDue} onChange={(e) => setNewDue(e.target.value)} suppressHydrationWarning />
            <TextField id={`e-reason-${data.id}`} label={t("reason")} dir="auto" value={extReason} onChange={(e) => setExtReason(e.target.value)} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="checkbox mt-0.5" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
              {t("reopen")}
            </label>
            <ErrorNote error={extend.error} />
            <SavedNote saved={extend.saved} text={t("applied")} />
            <div>
              <button
                type="button"
                className="btn-outline btn-sm"
                disabled={extend.busy || !newDue}
                onClick={() => {
                  const iso = fromLocalInput(newDue);
                  if (!iso) return;
                  void extend.run(
                    () =>
                      apiRequest("POST", `/api/questions/${data.questionId}/extensions`, {
                        userId: data.studentId,
                        newDueAt: iso,
                        reason: extReason.trim() || null,
                        reopen,
                      }),
                    () => router.refresh(),
                  );
                }}
              >
                {t("apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
