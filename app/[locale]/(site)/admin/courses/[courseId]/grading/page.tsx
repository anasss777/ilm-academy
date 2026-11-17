import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { listExamAttempts, listSubmissionQueue } from "@/lib/staff/queues";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { Pagination } from "@/components/site/pagination";
import { ReleaseButton } from "@/components/admin/release-button";
import { SubmissionGradeCard } from "@/components/admin/submission-grade-card";

const PAGE_SIZE = 10;
type Filter = "UNGRADED" | "GRADED" | "ALL";

export default async function AdminGradingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, courseId, user, perms, base } = await adminCourseContext(params, "/grading");
  const canWritten = perms.has("submission.view");
  const canExam = perms.has("exam.grade");
  if (!canWritten && !canExam) redirect({ href: "/admin/no-access", locale });

  const sp = await searchParams;
  const t = await getTranslations("admin.grading");

  const status: Filter = sp.status === "GRADED" || sp.status === "ALL" ? sp.status : "UNGRADED";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const [queue, settings, held, exam] = await Promise.all([
    canWritten ? listSubmissionQueue(db, { courseId, status, page, pageSize: PAGE_SIZE }) : null,
    db.courseSettings.findUnique({ where: { courseId }, select: { defaultPenaltyType: true, defaultPenaltyValue: true } }),
    perms.has("submission.grade")
      ? db.question.findMany({
          where: { courseId, deletedAt: null, submissions: { some: { gradedAt: { not: null }, releasedAt: null } } },
          select: {
            id: true,
            body: true,
            lecture: { select: { number: true } },
            _count: { select: { submissions: { where: { gradedAt: { not: null }, releasedAt: null } } } },
          },
        })
      : Promise.resolve([]),
    canExam ? db.exam.findFirst({ where: { courseId, deletedAt: null }, select: { id: true } }) : Promise.resolve(null),
  ]);

  const attempts = exam ? await listExamAttempts(db, { examId: exam.id, status: "SUBMITTED", page: 1, pageSize: 50 }) : null;

  const filterLink = (value: Filter, label: string) => (
    <Link
      key={value}
      href={`${base}/grading?status=${value}`}
      className={status === value ? "btn-primary btn-sm" : "btn-outline btn-sm"}
      aria-current={status === value ? "true" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <div className="stack gap-8">
      {queue ? (
        <section className="stack gap-4">
          <h2 className="title-section">{t("written")}</h2>

          {held.length > 0 ? (
            <div className="card stack gap-3">
              <div className="stack gap-1">
                <h3 className="title-card">{t("heldTitle")}</h3>
                <p className="text-sm text-muted">{t("heldBody")}</p>
              </div>
              <ul className="stack gap-3">
                {held.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span dir="auto" className="min-w-0 flex-1">
                      {q.lecture ? `${t("lecture", { number: String(q.lecture.number) })} · ` : ""}
                      {q.body.length > 70 ? `${q.body.slice(0, 70)}…` : q.body} ({q._count.submissions})
                    </span>
                    <ReleaseButton url={`/api/questions/${q.id}/release`} label={t("releaseHeld")} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="cluster gap-2">
            {filterLink("UNGRADED", t("ungraded"))}
            {filterLink("GRADED", t("graded"))}
            {filterLink("ALL", t("all"))}
          </div>

          {queue.items.length === 0 ? (
            <div className="empty-state">
              <p>{t("empty")}</p>
            </div>
          ) : (
            <div className="stack gap-4">
              {queue.items.map((s) => (
                <SubmissionGradeCard
                  key={s.id}
                  canGrade={perms.has("submission.grade")}
                  canExtend={perms.has("submission.extend")}
                  defaults={{
                    penaltyType: settings?.defaultPenaltyType ?? "NONE",
                    penaltyValue: Number(settings?.defaultPenaltyValue ?? 0),
                  }}
                  data={{
                    id: s.id,
                    studentId: s.student.id,
                    studentName: s.student.fullName,
                    studentEmail: s.student.email,
                    questionId: s.question.id,
                    questionType: s.question.type,
                    questionBody: s.question.body,
                    lectureLabel: s.question.lectureNumber != null ? t("lecture", { number: String(s.question.lectureNumber) }) : null,
                    points: s.question.points,
                    submittedAtText: formatDateTime(s.submittedAt, locale, user.timezone),
                    isLate: s.isLate,
                    excuseGranted: s.excuse.granted,
                    excuseReason: s.excuse.reason,
                    answerText: s.answerText,
                    selectedOptionText: s.selectedOption?.text ?? null,
                    selectedOptionCorrect: s.selectedOption ? s.selectedOption.isCorrect : null,
                    rawScore: s.rawScore,
                    finalScore: s.finalScore,
                    penaltyType: s.penaltyType,
                    penaltyValue: s.penaltyValue,
                    feedback: s.feedback,
                    graded: s.gradedAt != null,
                    released: s.releasedAt != null,
                  }}
                />
              ))}
            </div>
          )}

          <Pagination pathname={`${base}/grading`} page={page} pageSize={PAGE_SIZE} total={queue.total} query={{ status }} />
        </section>
      ) : null}

      {canExam && exam ? (
        <section className="stack gap-4">
          <h2 className="title-section">{t("examsTitle")}</h2>
          {attempts && attempts.items.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {attempts.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="font-medium text-ink" dir="auto">{a.student.fullName}</div>
                        <div className="text-xs text-muted" dir="ltr">{a.student.email}</div>
                      </td>
                      <td>
                        <div className="stack gap-0.5 text-sm">
                          <span>{t("attempt", { number: String(a.attemptNumber) })}</span>
                          <span className="text-muted">{t("pendingAnswers", { count: String(a.pendingManual) })}</span>
                        </div>
                      </td>
                      <td className="text-end">
                        <Link href={`${base}/grading/exams/${a.id}`} className="link text-sm">
                          {t("openAttempt")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("examsEmpty")}</p>
          )}
          <ReleaseButton url={`/api/exams/${exam.id}/release`} label={t("releaseExam")} />
        </section>
      ) : null}
    </div>
  );
}
