import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { courseReport } from "@/lib/staff/reports";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { ColumnChart } from "@/components/admin/column-chart";
import { SegmentedBar } from "@/components/admin/segmented-bar";
import { ProgressMeter } from "@/components/student/progress-meter";

export default async function CourseReportPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user } = await adminCourseContext(params, "/reports", "report.view");
  const t = await getTranslations("admin.reports.course");
  const tq = await getTranslations("admin.questions");
  const tl = await getTranslations("admin.lectures");
  const r = await courseReport(db, courseId);

  const n = (v: number) => formatNumber(v, locale);
  const pct = (v: number | null) => (v == null ? "—" : formatPercent(v, locale));
  const tone = (v: number | null) => (v == null ? "primary" : v >= 75 ? "success" : v >= 50 ? "warning" : "danger");
  const statuses = ["PENDING", "AUTO_ELIGIBLE", "AUTO_INELIGIBLE", "APPROVED", "REJECTED"] as const;

  return (
    <div className="stack gap-8">
      {/* Enrollment */}
      <section className="card stack gap-4">
        <h2 className="title-card">{t("enrollment")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="stat">
            <span className="stat-value">{n(r.enrollment.active)}</span>
            <span className="stat-label">{t("active")}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{n(r.enrollment.withdrawn)}</span>
            <span className="stat-label">{t("withdrawn")}</span>
          </div>
        </div>
        <div className="stack gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("trend")}</h3>
          <ColumnChart
            ariaLabel={t("trendLabel")}
            items={r.enrollment.weekly.map((w) => ({ label: `${w.weekStart.getUTCDate()}/${w.weekStart.getUTCMonth() + 1}`, value: w.count }))}
          />
        </div>
      </section>

      {/* Attendance */}
      <section className="card stack gap-4">
        <div className="stack gap-1">
          <h2 className="title-card">{t("attendance")}</h2>
          <p className="text-sm text-muted">{t("attendanceNote")}</p>
        </div>
        {r.lectures.length === 0 ? (
          <p className="text-sm text-muted">{t("noLectures")}</p>
        ) : (
          <div className="stack gap-4">
            <div className="cluster gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><span className="seg-present size-2.5 rounded-full" />{t("present")}</span>
              <span className="flex items-center gap-1"><span className="seg-partial size-2.5 rounded-full" />{t("partial")}</span>
              <span className="flex items-center gap-1"><span className="seg-absent size-2.5 rounded-full" />{t("absent")}</span>
              <span className="flex items-center gap-1"><span className="seg-excused size-2.5 rounded-full" />{t("excused")}</span>
            </div>
            {r.lectures.map((l) => (
              <div key={l.id} className="stack gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink" dir="auto">
                    {tl("number", { number: String(l.number) })}: {localized(locale, l.titleAr, l.titleEn)}
                  </span>
                  <span className="text-sm text-muted">
                    {t("rate")}: <span className="font-semibold text-ink">{pct(l.rate)}</span>
                    {l.unrecorded > 0 ? ` · ${t("unrecorded")}: ${n(l.unrecorded)}` : ""}
                  </span>
                </div>
                <SegmentedBar
                  label={`${tl("number", { number: String(l.number) })}`}
                  segments={[
                    { className: "seg-present", value: l.PRESENT, title: t("present") },
                    { className: "seg-partial", value: l.PARTIAL, title: t("partial") },
                    { className: "seg-absent", value: l.ABSENT, title: t("absent") },
                    { className: "seg-excused", value: l.EXCUSED, title: t("excused") },
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Questions */}
      <section className="card stack gap-4">
        <h2 className="title-card">{t("questions")}</h2>
        {r.questions.length === 0 ? (
          <p className="text-sm text-muted">{t("noQuestions")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                {r.questions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div className="font-medium text-ink" dir="auto">{q.body.length > 80 ? `${q.body.slice(0, 80)}…` : q.body}</div>
                      <div className="text-xs text-muted">
                        {t("lecture", { number: String(q.lectureNumber) })} · {tq(`types.${q.type}`)} · {tq("points", { points: n(q.points) })}
                      </div>
                    </td>
                    <td>
                      <div className="stack gap-0.5 text-sm">
                        <span>{t("submitted", { count: n(q.submitted) })} / {n(r.enrollment.active)}</span>
                        <span className="text-xs text-muted">
                          {t("graded", { count: n(q.graded) })}
                          {q.late > 0 ? ` · ${t("late", { count: n(q.late) })}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="w-40">
                      <div className="stack gap-1">
                        <span className="text-xs text-muted">{t("avgScore")}: <span className="font-semibold text-ink">{pct(q.averagePercent)}</span></span>
                        <ProgressMeter value={q.averagePercent} tone={tone(q.averagePercent)} label={t("avgScore")} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Exam */}
      <section className="card stack gap-4">
        <h2 className="title-card">{t("exam")}</h2>
        {!r.exam ? (
          <p className="text-sm text-muted">{t("noExam")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="stat"><span className="stat-value">{n(r.exam.participants)}</span><span className="stat-label">{t("participants")}</span></div>
              <div className="stat"><span className="stat-value">{n(r.exam.submittedAttempts)}</span><span className="stat-label">{t("attempts")}</span></div>
              <div className="stat"><span className="stat-value">{pct(r.exam.averagePercent)}</span><span className="stat-label">{t("avgPercent")}</span></div>
              <div className="stat">
                <span className="stat-value">{pct(r.exam.passRate)}</span>
                <span className="stat-label">{t("passRate")}</span>
                <span className="text-xs text-muted">{t("passMark", { percent: formatPercent(r.exam.passingPercent, locale) })}</span>
              </div>
            </div>
            {r.exam.awaitingGrading > 0 ? <p className="alert-warning">{t("awaiting")}: {n(r.exam.awaitingGrading)}</p> : null}
            <div className="stack gap-2">
              <h3 className="text-sm font-semibold text-ink">{t("distribution")}</h3>
              {r.exam.scored === 0 ? (
                <p className="text-sm text-muted">{t("noScores")}</p>
              ) : (
                <ColumnChart ariaLabel={t("distributionLabel")} items={r.exam.distribution.map((b) => ({ label: `${b.from}`, value: b.count }))} />
              )}
            </div>
          </>
        )}
      </section>

      {/* Certificates */}
      <section className="card stack gap-4">
        <div className="stack gap-1">
          <h2 className="title-card">{t("certificates")}</h2>
          <p className="text-sm text-muted">{t("certNote")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {statuses.map((s) => (
            <div key={s} className="stat">
              <span className="stat-value">{n(r.certificates.byStatus[s] ?? 0)}</span>
              <span className="stat-label">{t(`statuses.${s}`)}</span>
            </div>
          ))}
        </div>
        <div className="stack gap-1 text-sm text-muted">
          {r.certificates.needsReReview > 0 ? <p>{t("needsReReview")}: <span className="font-semibold text-ink">{n(r.certificates.needsReReview)}</span></p> : null}
          <p>
            {t("exports")}: <span className="font-semibold text-ink">{n(r.certificates.exports)}</span>
            {r.certificates.lastExportAt ? ` · ${t("lastExport", { date: formatDate(r.certificates.lastExportAt, locale, user.timezone) })}` : ` · ${t("noExports")}`}
          </p>
        </div>
      </section>
    </div>
  );
}
