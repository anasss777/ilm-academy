import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { getAttemptForStudent } from "@/lib/read/service";
import { toDraft } from "@/lib/ui/exam-draft";
import { courseContext } from "@/lib/ui/context";
import { loadDashboard, orLeave } from "@/lib/ui/data";
import { ExamAttemptForm } from "@/components/student/exam-attempt-form";

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; attemptId: string }>;
}) {
  const ctx = await courseContext(params);
  const { locale, courseId, user, base } = ctx;
  const attemptId = parseUuid(ctx.attemptId);
  if (!attemptId) notFound();

  const t = await getTranslations("exam");
  const tq = await getTranslations("question");
  const dash = await orLeave(loadDashboard(user.id, courseId), locale);
  if (!dash.examId) notFound();

  const view = await orLeave(getAttemptForStudent(db, { userId: user.id, attemptId }), locale);
  // The attempt must belong to this course's exam
  if (view.attempt.examId !== dash.examId) notFound();

  const back = (
    <Link href={`${base}/exam`} className="link text-sm">
      {t("backToExam")}
    </Link>
  );
  const heading = <h2 className="title-section">{t("attemptNumber", { number: String(view.attempt.attemptNumber) })}</h2>;

  if (view.mode === "IN_PROGRESS") {
    return (
      <div className="stack gap-6">
        {back}
        {heading}
        <ExamAttemptForm
          attemptId={view.attempt.id}
          questions={view.questions.map((q) => ({
            id: q.id,
            type: q.type,
            body: q.body,
            pointsText: formatNumber(q.points, locale),
            options: q.options,
          }))}
          initialDraft={toDraft(view.answers)}
          dueText={view.dueAt ? formatDateTime(view.dueAt, locale, user.timezone) : null}
          expired={view.expired}
        />
      </div>
    );
  }

  if (view.mode === "PENDING") {
    return (
      <div className="stack gap-6">
        {back}
        {heading}
        <section className="card stack gap-2">
          <h2 className="title-card">{t("pendingTitle")}</h2>
          <p className="text-sm text-muted">{t("pendingBody")}</p>
        </section>
      </div>
    );
  }

  // RESULTS
  const total = view.attempt.totalScore ?? 0;
  const percent = view.maxScore > 0 ? (total / view.maxScore) * 100 : 0;
  return (
    <div className="stack gap-6">
      {back}
      {heading}

      <section className="card stack gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-card">{t("resultTitle")}</h2>
          {view.passed != null ? (
            <span className={view.passed ? "badge-success" : "badge-danger"}>
              {view.passed ? t("passed") : t("notPassed")}
            </span>
          ) : null}
        </div>
        <p>
          <span className="text-3xl font-bold text-ink">{formatNumber(total, locale)}</span>{" "}
          <span className="text-muted">/ {formatNumber(view.maxScore, locale)}</span>
          <span className="text-muted"> · {formatPercent(percent, locale)}</span>
        </p>
        {!view.revealed ? <p className="text-sm text-muted">{t("keyHidden")}</p> : null}
      </section>

      {view.results.map((r, i) => {
        const correct = new Set(r.question.correctOptionIds ?? []);
        const mine = r.myAnswer?.selectedOptionId ?? null;
        const isOpen = r.question.type === "OPEN";
        return (
          <section key={r.question.id} className="card stack gap-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="title-card">{t("question", { number: String(i + 1) })}</h3>
              <span className="badge-muted">
                {r.score != null ? formatNumber(r.score, locale) : "—"} / {formatNumber(r.question.points, locale)}
              </span>
            </div>
            <p className="prose-block" dir="auto">{r.question.body}</p>

            {isOpen ? (
              <div className="stack gap-1">
                <p className="text-sm font-semibold text-ink">{t("yourAnswer")}</p>
                {r.myAnswer?.answerText ? (
                  <p className="prose-block panel" dir="auto">{r.myAnswer.answerText}</p>
                ) : (
                  <p className="text-sm text-muted">{t("noAnswer")}</p>
                )}
              </div>
            ) : (
              <div className="stack gap-2">
                {r.question.options.map((o) => {
                  const chosen = o.id === mine;
                  const cls = view.revealed
                    ? correct.has(o.id) ? "option option-correct" : chosen ? "option option-wrong" : "option"
                    : chosen ? "option option-selected" : "option";
                  return (
                    <div key={o.id} className={cls}>
                      <span className="flex-1" dir="auto">{o.text}</span>
                      {view.revealed && correct.has(o.id) ? <span className="badge-success">{t("correctAnswer")}</span> : null}
                      {chosen && !(view.revealed && correct.has(o.id)) ? <span className="badge-primary">{tq("yourChoice")}</span> : null}
                    </div>
                  );
                })}
                {mine == null ? <p className="text-sm text-muted">{t("noAnswer")}</p> : null}
              </div>
            )}

            {r.feedback ? (
              <div className="panel stack gap-1">
                <p className="font-semibold text-ink">{t("feedback")}</p>
                <p className="prose-block text-sm" dir="auto">{r.feedback}</p>
              </div>
            ) : null}
            {view.revealed && r.question.explanation ? (
              <div className="stack gap-1">
                <p className="text-sm font-semibold text-ink">{t("explanation")}</p>
                <p className="prose-block text-sm" dir="auto">{r.question.explanation}</p>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
