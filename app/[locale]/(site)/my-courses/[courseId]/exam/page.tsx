import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { finalizeOverdueForUser } from "@/lib/exams/service";
import { getExamForStudent } from "@/lib/read/service";
import { courseContext } from "@/lib/ui/context";
import { loadDashboard, orLeave } from "@/lib/ui/data";
import { ExamStartButton } from "@/components/student/exam-start-button";

export default async function ExamPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, base } = await courseContext(params, "/exam");
  const dash = await orLeave(loadDashboard(user.id, courseId), locale);
  if (!dash.examId) notFound();

  const t = await getTranslations("exam");
  // An attempt whose time ran out while the student was away is submitted before the page is built
  await finalizeOverdueForUser(db, { examId: dash.examId, userId: user.id });
  const exam = await orLeave(getExamForStudent(db, { userId: user.id, examId: dash.examId }), locale);
  const description = localized(locale, exam.descriptionAr, exam.descriptionEn);
  const inProgress = exam.attempts.find((a) => a.status === "IN_PROGRESS");
  const stateTone = exam.state === "OPEN" ? "badge-success" : exam.state === "CLOSED" ? "badge-muted" : "badge-warning";

  return (
    <div className="stack gap-6">
      <section className="card stack gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-section">{localized(locale, exam.titleAr, exam.titleEn)}</h2>
          <span className={stateTone}>{t(`state.${exam.state}`)}</span>
        </div>
        {description ? <p className="prose-block text-sm">{description}</p> : null}

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">{t("maxScore")}</dt>
            <dd className="text-lg font-semibold">{formatNumber(exam.maxScore, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("passMark")}</dt>
            <dd className="text-lg font-semibold">{formatPercent(exam.passingPercent, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("timeLimit")}</dt>
            <dd className="text-lg font-semibold">
              {exam.durationMinutes ? `${formatNumber(exam.durationMinutes, locale)} ${t("minutesShort")}` : t("noTimeLimit")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t("attempts")}</dt>
            <dd className="text-lg font-semibold">
              {t("attemptsOf", { used: String(exam.attemptsUsed), allowed: String(exam.attemptsAllowed) })}
            </dd>
          </div>
        </dl>

        <div className="stack gap-1 text-sm">
          {exam.opensAt ? <p>{t("opens", { date: formatDateTime(exam.opensAt, locale, user.timezone) })}</p> : null}
          {exam.dueAt ? <p>{t("closes", { date: formatDateTime(exam.dueAt, locale, user.timezone) })}</p> : null}
          {!exam.opensAt && !exam.dueAt ? <p className="text-muted">{t("noWindow")}</p> : null}
        </div>

        <p className="text-sm text-muted">{t("intro")}</p>
        {exam.durationMinutes ? <p className="alert-info">{t("timedNote", { minutes: String(exam.durationMinutes) })}</p> : null}

        {exam.canStart ? (
          <ExamStartButton examId={exam.id} courseId={courseId} resume={!!inProgress} durationMinutes={exam.durationMinutes} />
        ) : inProgress ? (
          <div>
            <Link href={`${base}/exam/attempts/${inProgress.id}`} className="btn-outline">
              {t("open")}
            </Link>
          </div>
        ) : exam.state !== "CLOSED" && exam.attemptsUsed >= exam.attemptsAllowed ? (
          <p className="alert-info">{t("noneLeft")}</p>
        ) : null}
      </section>

      <section className="stack gap-3">
        <h2 className="title-section">{t("yourAttempts")}</h2>
        {exam.attempts.length === 0 ? (
          <p className="text-sm text-muted">{t("noAttempts")}</p>
        ) : (
          <ul className="stack gap-3">
            {exam.attempts.map((a) => (
              <li key={a.id} className="card-plain card-link">
                <Link href={`${base}/exam/attempts/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="stack gap-1">
                    <span className="title-card">{t("attemptNumber", { number: String(a.attemptNumber) })}</span>
                    <span className="text-sm text-muted">{formatDateTime(a.startedAt, locale, user.timezone)}</span>
                  </div>
                  <div className="cluster gap-2">
                    <span className={a.status === "GRADED" ? "badge-success" : a.status === "IN_PROGRESS" ? "badge-primary" : "badge-info"}>
                      {t(`status.${a.status}`)}
                    </span>
                    {a.released && a.totalScore != null ? (
                      <span className="badge-muted">
                        {formatNumber(a.totalScore, locale)} / {formatNumber(exam.maxScore, locale)}
                      </span>
                    ) : null}
                    <span className="link text-sm">{a.released ? t("viewResults") : t("open")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
