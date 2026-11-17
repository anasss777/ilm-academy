import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { getExamForStaff } from "@/lib/staff/exams";
import { listQuestionsForStaff } from "@/lib/staff/questions";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { ExamForm } from "@/components/admin/exam-form";

export default async function AdminExamPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, perms, base } = await adminCourseContext(params, "/exam", "exam.edit");
  const t = await getTranslations("admin.exam");
  const tq = await getTranslations("admin.questions");
  const tn = await getTranslations("admin.nav");

  const course = await db.course.findUnique({ where: { id: courseId }, select: { examEnabled: true } });
  const existing = await db.exam.findFirst({ where: { courseId, deletedAt: null }, select: { id: true } });

  if (!existing) {
    if (!course?.examEnabled) {
      return (
        <div className="stack gap-3">
          <p className="alert-info">{t("notEnabled")}</p>
          <div>
            <Link href={base} className="btn-outline">
              {tn("details")}
            </Link>
          </div>
        </div>
      );
    }
    return perms.has("exam.create") ? <ExamForm mode="create" courseId={courseId} /> : <p className="alert-info">{t("noQuestions")}</p>;
  }

  const [exam, questions] = await Promise.all([
    getExamForStaff(db, existing.id),
    listQuestionsForStaff(db, { kind: "exam", examId: existing.id }),
  ]);

  return (
    <div className="stack gap-6">
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("stats", {
            published: String(exam.publishedQuestionCount),
            count: String(exam.questionCount),
            score: formatNumber(exam.maxScore, locale),
          })}{" "}
          · {t("attemptsCount", { count: String(exam.attemptCount) })}
        </p>
        {perms.has("exam.grade") ? (
          <Link href={`${base}/grading`} className="btn-outline btn-sm">
            {t("gradingLink")}
          </Link>
        ) : null}
      </section>

      <ExamForm
        mode="edit"
        courseId={courseId}
        canDelete={exam.attemptCount === 0}
        initial={{
          id: exam.id,
          titleAr: exam.titleAr,
          titleEn: exam.titleEn ?? "",
          descriptionAr: exam.descriptionAr ?? "",
          descriptionEn: exam.descriptionEn ?? "",
          opensAt: exam.opensAt ? exam.opensAt.toISOString() : null,
          dueAt: exam.dueAt ? exam.dueAt.toISOString() : null,
          passingPercent: exam.passingPercent,
          attemptLimit: exam.attemptLimit,
          status: exam.status as "DRAFT" | "PUBLISHED",
        }}
      />

      <section className="card stack gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="title-card">{t("questions")}</h2>
          <Link href={`${base}/questions/new?examId=${exam.id}`} className="btn-outline btn-sm">
            {t("addQuestion")}
          </Link>
        </div>
        {questions.items.length === 0 ? (
          <p className="text-sm text-muted">{t("noQuestions")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                {questions.items.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div className="font-medium text-ink" dir="auto">
                        {q.body.length > 90 ? `${q.body.slice(0, 90)}…` : q.body}
                      </div>
                      <div className="text-xs text-muted">
                        {tq(`types.${q.type}`)} · {t("points", { points: formatNumber(q.points, locale) })}
                      </div>
                    </td>
                    <td>
                      <div className="cluster gap-2">
                        <span className={q.status === "PUBLISHED" ? "badge-success" : "badge-warning"}>
                          {q.status === "PUBLISHED" ? tq("published") : tq("draft")}
                        </span>
                        {q.answerCount > 0 ? <span className="badge-muted">{t("answers", { count: String(q.answerCount) })}</span> : null}
                      </div>
                    </td>
                    <td className="text-end">
                      <Link href={`${base}/questions/${q.id}`} className="link text-sm">
                        {tq("edit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
