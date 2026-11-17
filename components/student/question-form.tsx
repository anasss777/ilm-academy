"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { apiErrorKey } from "@/lib/ui/errors";

export type QuestionView = {
  id: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";
  options: { id: string; text: string }[];
  /** Present only when the reveal rules allow the answer key to be shown */
  correctOptionIds?: string[];
  explanation?: string | null;
};

export type SubmissionView = {
  answerText: string | null;
  selectedOptionId: string | null;
  released: boolean;
  isLate: boolean;
  excuseGranted: boolean;
  feedback: string | null;
  /** Preformatted on the server so the browser never reformats the digits */
  result: {
    finalText: string;
    outOfText: string;
    rawText: string | null;
    penaltyKind: "PERCENT" | "POINTS" | null;
    penaltyText: string | null;
  } | null;
};

export type LockReason =
  | "DEADLINE_PASSED"
  | "SUBMISSIONS_CLOSED"
  | "ALREADY_GRADED";

export function QuestionForm({
  question,
  submission,
  canSubmit,
  lockReason,
  isLateNow,
}: {
  question: QuestionView;
  submission: SubmissionView | null;
  canSubmit: boolean;
  lockReason: LockReason | null;
  isLateNow: boolean;
}) {
  const t = useTranslations("question");
  const te = useTranslations("apiErrors");
  const router = useRouter();
  const locale = useLocale();
  const isArabic = locale === "ar";

  const isOpen = question.type === "OPEN";
  const [selected, setSelected] = useState<string | null>(
    submission?.selectedOptionId ?? null,
  );
  const [text, setText] = useState(submission?.answerText ?? "");
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const revealed = question.correctOptionIds !== undefined;
  const correct = new Set(question.correctOptionIds ?? []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(false);
    if (isOpen ? !text.trim() : !selected) {
      setErrorCode("INVALID_ANSWER");
      return;
    }
    setErrorCode(null);
    setBusy(true);
    const res = await apiRequest(
      "POST",
      `/api/questions/${question.id}/submissions`,
      isOpen ? { answerText: text } : { selectedOptionId: selected },
    );
    setBusy(false);
    if (!res.ok) {
      setErrorCode(res.code);
      return;
    }
    setSent(true);
    router.refresh();
  }

  // Read-only option styling: the student's choice, and the key once it may be shown
  const readOnlyClass = (id: string) => {
    const chosen = id === submission?.selectedOptionId;
    if (revealed)
      return correct.has(id)
        ? "option option-correct"
        : chosen
          ? "option option-wrong"
          : "option";
    return chosen ? "option option-selected" : "option";
  };

  return (
    <div className="stack gap-5">
      {submission?.released && submission.result ? (
        <section className="card stack gap-3">
          <h2 className="title-card">{t("result")}</h2>
          <p>
            <span className="text-3xl font-bold text-ink">
              {submission.result.finalText}
            </span>{" "}
            <span className="text-muted">
              {t("outOf", { points: submission.result.outOfText })}
            </span>
          </p>
          {submission.result.penaltyKind && submission.result.penaltyText ? (
            <p className="text-sm text-muted">
              {submission.result.rawText
                ? `${t("rawScore", { score: submission.result.rawText })} · `
                : ""}
              {submission.result.penaltyKind === "PERCENT"
                ? t("penaltyPercent", { value: submission.result.penaltyText })
                : t("penaltyPoints", { value: submission.result.penaltyText })}
            </p>
          ) : null}
          {submission.isLate && submission.excuseGranted ? (
            <p className="text-sm text-success">{t("excused")}</p>
          ) : null}
          {submission.feedback ? (
            <div className="panel stack gap-1">
              <p className="font-semibold text-ink">{t("feedback")}</p>
              <p className="prose-block text-sm" dir="auto">
                {submission.feedback}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {submission && !submission.released ? (
        <p className="alert-info">{t("awaiting")}</p>
      ) : null}
      {canSubmit && isLateNow ? (
        <p className="alert-warning">{t("lateWarning")}</p>
      ) : null}
      {!canSubmit && lockReason ? (
        <p className="alert-warning">{t(`locked.${lockReason}`)}</p>
      ) : null}

      <section className="card stack gap-4">
        <h2 className="title-card">{t("yourAnswer")}</h2>

        {canSubmit ? (
          <form onSubmit={onSubmit} className="stack gap-4" noValidate>
            {isOpen ? (
              <textarea
                className={`textarea ${isArabic ? "text-right rtl" : ""}`}
                rows={9}
                dir="auto"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("yourAnswer")}
                disabled={busy}
              />
            ) : (
              <div
                className="stack gap-2"
                role="radiogroup"
                aria-label={t("yourAnswer")}
              >
                {question.options.map((o) => (
                  <label
                    key={o.id}
                    className={
                      selected === o.id
                        ? "option option-selected cursor-pointer"
                        : "option cursor-pointer"
                    }
                  >
                    <input
                      type="radio"
                      name="answer"
                      className="radio mt-0.5"
                      value={o.id}
                      checked={selected === o.id}
                      onChange={() => setSelected(o.id)}
                      disabled={busy}
                    />
                    <span dir="auto">{o.text}</span>
                  </label>
                ))}
              </div>
            )}

            {errorCode ? (
              <p role="alert" className="alert-error">
                {te(apiErrorKey(errorCode))}
              </p>
            ) : null}
            {sent && !errorCode ? (
              <p className="alert-success">{t("sent")}</p>
            ) : null}

            <div>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? t("sending") : submission ? t("update") : t("submit")}
              </button>
            </div>
          </form>
        ) : isOpen ? (
          submission?.answerText ? (
            <p className="prose-block panel" dir="auto">
              {submission.answerText}
            </p>
          ) : (
            <p className="text-sm text-muted">—</p>
          )
        ) : (
          <div className="stack gap-2">
            {question.options.map((o) => (
              <div key={o.id} className={readOnlyClass(o.id)}>
                <span className="flex-1" dir="auto">
                  {o.text}
                </span>
                {revealed && correct.has(o.id) ? (
                  <span className="badge-success">{t("correct")}</span>
                ) : null}
                {revealed &&
                !correct.has(o.id) &&
                o.id === submission?.selectedOptionId ? (
                  <span className="badge-danger">{t("incorrect")}</span>
                ) : null}
                {!revealed && o.id === submission?.selectedOptionId ? (
                  <span className="badge-primary">{t("yourChoice")}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {revealed && question.explanation ? (
        <section className="card stack gap-2">
          <h2 className="title-card">{t("explanation")}</h2>
          <p className="prose-block text-sm" dir="auto">
            {question.explanation}
          </p>
        </section>
      ) : null}
    </div>
  );
}
