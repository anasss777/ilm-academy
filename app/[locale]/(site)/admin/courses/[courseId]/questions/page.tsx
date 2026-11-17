import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { adminCourseContext } from "@/lib/ui/admin-context";

export default async function AdminQuestionsPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, perms, base } = await adminCourseContext(params, "/questions", "question.edit");
  const t = await getTranslations("admin.questions");
  const tl = await getTranslations("admin.lectures");

  const course = await db.course.findUnique({ where: { id: courseId }, select: { questionsEnabled: true } });
  if (!course?.questionsEnabled) {
    return (
      <div className="stack gap-3">
        <p className="alert-info">{t("disabled")}</p>
        <div>
          <Link href={base} className="btn-outline">
            {(await getTranslations("admin.nav"))("details")}
          </Link>
        </div>
      </div>
    );
  }

  const lectures = await db.lecture.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      titleAr: true,
      titleEn: true,
      questions: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          type: true,
          body: true,
          points: true,
          status: true,
          dueAt: true,
          _count: { select: { submissions: true } },
        },
      },
    },
  });

  if (lectures.length === 0) {
    return (
      <div className="empty-state">
        <p>{t("noLectures")}</p>
      </div>
    );
  }

  return (
    <div className="stack gap-6">
      <h2 className="title-section">{t("title")}</h2>
      {lectures.map((l) => (
        <section key={l.id} className="card stack gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="title-card" dir="auto">
              {tl("number", { number: String(l.number) })}: {localized(locale, l.titleAr, l.titleEn)}
            </h3>
            {perms.has("question.create") ? (
              <Link href={`${base}/questions/new?lectureId=${l.id}`} className="btn-outline btn-sm">
                {t("add")}
              </Link>
            ) : null}
          </div>

          {l.questions.length === 0 ? (
            <p className="text-sm text-muted">{t("empty")}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {l.questions.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <div className="font-medium text-ink" dir="auto">
                          {q.body.length > 90 ? `${q.body.slice(0, 90)}…` : q.body}
                        </div>
                        <div className="text-xs text-muted">
                          {t(`types.${q.type}`)} · {t("points", { points: formatNumber(q.points.toNumber(), locale) })}
                          {q.dueAt ? ` · ${formatDateTime(q.dueAt, locale, user.timezone)}` : ""}
                        </div>
                      </td>
                      <td>
                        <div className="cluster gap-2">
                          <span className={q.status === "PUBLISHED" ? "badge-success" : "badge-warning"}>
                            {q.status === "PUBLISHED" ? t("published") : t("draft")}
                          </span>
                          {q._count.submissions > 0 ? (
                            <span className="badge-muted">{t("answers", { count: String(q._count.submissions) })}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-end">
                        <Link href={`${base}/questions/${q.id}`} className="link text-sm">
                          {t("edit")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
