import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { courseContext } from "@/lib/ui/context";
import { loadDashboard, loadLectures, orLeave } from "@/lib/ui/data";
import { QuestionStatusBadge } from "@/components/student/badges";

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, base } = await courseContext(params, "/questions");
  const [dash, { lectures }] = await Promise.all([
    orLeave(loadDashboard(user.id, courseId), locale),
    orLeave(loadLectures(user.id, courseId), locale),
  ]);
  if (!dash.course.features.questions) notFound();

  const t = await getTranslations("question");

  // Needs-attention first (not answered), newest lecture first inside each group
  const rows = lectures
    .flatMap((l) => l.questions.map((q) => ({ lecture: l, q })))
    .sort((a, b) => {
      const open = (s: string) => (s === "NOT_SUBMITTED" ? 0 : 1);
      return open(a.q.status) - open(b.q.status) || b.lecture.number - a.lecture.number;
    });

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>{t("listEmpty")}</p>
      </div>
    );
  }

  const now = new Date();
  return (
    <div className="stack gap-4">
      <h2 className="title-section">{t("listTitle")}</h2>
      <ul className="stack gap-3">
        {rows.map(({ lecture, q }) => {
          const overdue = q.status === "NOT_SUBMITTED" && q.dueAt != null && q.dueAt.getTime() < now.getTime();
          return (
            <li key={q.id} className="card-plain card-link">
              <Link href={`${base}/questions/${q.id}`} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="stack gap-1">
                  <span className="text-sm font-semibold text-muted">
                    {t("listLecture", { number: String(lecture.number) })} · {localized(locale, lecture.titleAr, lecture.titleEn)}
                  </span>
                  <span className="title-card">{t(`types.${q.type}`)}</span>
                  <span className="text-sm text-muted">
                    {q.dueAt ? t("due", { date: formatDateTime(q.dueAt, locale, user.timezone) }) : t("noDeadline")} ·{" "}
                    {t("points", { points: formatNumber(q.points, locale) })}
                  </span>
                </div>
                <div className="cluster gap-2">
                  {overdue ? <span className="badge-danger">{t("overdue")}</span> : null}
                  <QuestionStatusBadge status={q.status} />
                  {q.status === "GRADED" && q.score != null ? (
                    <span className="badge-success">{t("statusGraded", { score: formatNumber(q.score, locale) })}</span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
