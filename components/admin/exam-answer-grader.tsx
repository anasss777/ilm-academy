"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

export type ExamAnswerData = {
  id: string;
  number: number;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";
  body: string;
  points: number;
  answerText: string | null;
  selectedOptionId: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
  isCorrect: boolean | null;
  score: number | null;
  autoGraded: boolean;
  feedback: string | null;
};

function AnswerRow({ a, canGrade }: { a: ExamAnswerData; canGrade: boolean }) {
  const t = useTranslations("admin.grading");
  const router = useRouter();
  const { busy, error, saved, run, fail } = useSave();
  const [score, setScore] = useState(a.score != null ? String(a.score) : "");
  const [feedback, setFeedback] = useState(a.feedback ?? "");
  const written = a.type === "OPEN";
  const chosen = a.options.find((o) => o.id === a.selectedOptionId);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Number(score);
    if (score.trim() === "" || !Number.isFinite(n)) {
      fail({ code: "SCORE_OUT_OF_RANGE" });
      return;
    }
    await run(
      () => apiRequest("PUT", `/api/exam-answers/${a.id}/grade`, { score: n, feedback: feedback.trim() || null, release: false }),
      () => router.refresh(),
    );
  }

  return (
    <article className="card stack gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="title-card">{t("questionN", { number: String(a.number) })}</h3>
        <div className="cluster gap-2">
          <span className="badge-muted">
            {a.score != null ? a.score : "—"} / {a.points}
          </span>
          {a.autoGraded ? <span className="badge-info">{t("autoGraded")}</span> : null}
          {a.score == null ? <span className="badge-warning">{t("awaiting")}</span> : null}
        </div>
      </header>

      <p className="prose-block text-sm text-muted" dir="auto">{a.body}</p>

      {written ? (
        <p className="prose-block panel" dir="auto">{a.answerText || t("noAnswer")}</p>
      ) : (
        <div className="stack gap-2">
          {a.options.map((o) => {
            const isChosen = o.id === a.selectedOptionId;
            const cls = o.isCorrect ? "option option-correct" : isChosen ? "option option-wrong" : "option";
            return (
              <div key={o.id} className={cls}>
                <span className="flex-1" dir="auto">{o.text}</span>
                {o.isCorrect ? <span className="badge-success">{t("correctChoice")}</span> : null}
                {isChosen && !o.isCorrect ? <span className="badge-danger">{t("wrongChoice")}</span> : null}
              </div>
            );
          })}
          {!chosen ? <p className="text-sm text-muted">{t("noAnswer")}</p> : null}
        </div>
      )}

      {canGrade && written ? (
        <form onSubmit={onSave} className="stack gap-3 border-t border-line pt-4" noValidate>
          <TextField
            id={`ea-score-${a.id}`}
            label={t("scoreLabel", { max: String(a.points) })}
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max={String(a.points)}
            dir="ltr"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
          <TextAreaField id={`ea-fb-${a.id}`} label={t("feedback")} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <ErrorNote error={error} />
          <SavedNote saved={saved} text={t("savedGrade")} />
          <div>
            <button type="submit" className="btn-primary btn-sm" disabled={busy}>
              {busy ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function ExamAnswerGrader({ answers, canGrade }: { answers: ExamAnswerData[]; canGrade: boolean }) {
  return (
    <div className="stack gap-4">
      {answers.map((a) => (
        <AnswerRow key={a.id} a={a} canGrade={canGrade} />
      ))}
    </div>
  );
}
