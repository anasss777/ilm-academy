import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { formatNumber, formatPercent } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { platformOverview, reportScope } from "@/lib/staff/reports";

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser(locale, "/admin/reports");
  const scope = await reportScope(db, user.id);
  if (!scope.all && scope.courseIds.length === 0) redirect({ href: "/admin/no-access", locale });

  const t = await getTranslations("admin.reports");
  const tn = await getTranslations("admin.nav");
  const td = await getTranslations("admin.dashboard");
  const { totals, courses } = await platformOverview(db, scope);
  const n = (v: number) => formatNumber(v, locale);

  const stats: { label: string; value: string; detail?: string }[] = [
    {
      label: t("overview.courses"),
      value: n(totals.courses),
      detail: t("overview.coursesDetail", { published: n(totals.published), draft: n(totals.draft), archived: n(totals.archived) }),
    },
    { label: t("overview.students"), value: n(totals.students) },
    { label: t("overview.newEnrollments"), value: n(totals.newEnrollments) },
    { label: t("overview.upcoming"), value: n(totals.upcomingLectures) },
    { label: t("overview.ungraded"), value: n(totals.ungradedAnswers) },
    { label: t("overview.examsWaiting"), value: n(totals.examsWaiting) },
    { label: t("overview.approved"), value: n(totals.approvedCertificates) },
    { label: t("overview.exports"), value: n(totals.exports30) },
  ];

  return (
    <div className="container-page section stack gap-6">
      <Link href="/admin" className="link text-sm">
        {tn("dashboard")}
      </Link>
      <div className="stack gap-1">
        <h1 className="title-page">{t("title")}</h1>
        <p className="lead">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
            {s.detail ? <span className="text-xs text-muted">{s.detail}</span> : null}
          </div>
        ))}
      </div>

      {courses.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("table.course")}</th>
                <th>{t("table.students")}</th>
                <th>{t("table.lectures")}</th>
                <th>{t("table.attendance")}</th>
                <th>{t("table.eligible")}</th>
                <th>{t("table.approved")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-ink" dir="auto">{localized(locale, c.titleAr, c.titleEn)}</div>
                    <span className={c.status === "PUBLISHED" ? "badge-success" : c.status === "ARCHIVED" ? "badge-muted" : "badge-warning"}>
                      {td(`status.${c.status}`)}
                    </span>
                  </td>
                  <td>
                    {n(c.active)}
                    {c.withdrawn > 0 ? <span className="text-xs text-muted"> (+{n(c.withdrawn)} {t("table.withdrawn")})</span> : null}
                  </td>
                  <td>{n(c.heldLectures)}</td>
                  <td>{c.attendanceRate == null ? "—" : formatPercent(c.attendanceRate, locale)}</td>
                  <td>{n(c.eligible)}</td>
                  <td>{n(c.approved)}</td>
                  <td className="text-end">
                    <Link href={`/admin/courses/${c.id}/reports`} className="link text-sm">
                      {t("viewCourse")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
