import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { getPerms } from "@/lib/auth/page-permissions";
import { getStaffScope } from "@/lib/auth/staff";
import { reportScope } from "@/lib/staff/reports";
import { localized } from "@/lib/i18n-content";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser(locale, "/admin");
  const scope = await getStaffScope(user.id);
  if (!scope.isStaff) redirect({ href: "/admin/no-access", locale });

  const t = await getTranslations("admin.dashboard");
  const tn = await getTranslations("admin.nav");
  const orgPerms = await getPerms(user.id);
  const reports = await reportScope(db, user.id);
  const canReport = reports.all || reports.courseIds.length > 0;

  const courses = await db.course.findMany({
    where: scope.allCourses ? {} : { id: { in: scope.courseIds } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titleAr: true,
      titleEn: true,
      status: true,
      _count: {
        select: {
          lectures: { where: { deletedAt: null } },
          enrollments: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  return (
    <div className="container-page section stack gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="stack gap-1">
          <h1 className="title-page">{t("title")}</h1>
          <p className="lead">{t("subtitle")}</p>
        </div>
        <div className="cluster gap-2">
          {canReport ? (
            <Link href="/admin/reports" className="btn-outline">
              {tn("reports")}
            </Link>
          ) : null}
          {orgPerms.has("audit.view") ? (
            <Link href="/admin/audit" className="btn-outline">
              {tn("audit")}
            </Link>
          ) : null}
          {orgPerms.has("user.manage") ? (
            <Link href="/admin/team" className="btn-outline">
              {tn("team")}
            </Link>
          ) : null}
          {orgPerms.has("role.manage") ? (
            <Link href="/admin/roles" className="btn-outline">
              {tn("roles")}
            </Link>
          ) : null}
          {orgPerms.has("course.create") ? (
            <Link href="/admin/courses/new" className="btn-primary">
              {t("newCourse")}
            </Link>
          ) : null}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
        </div>
      ) : (
        <ul className="grid-cards">
          {courses.map((c) => {
            const tone =
              c.status === "PUBLISHED"
                ? "badge-success"
                : c.status === "ARCHIVED"
                  ? "badge-muted"
                  : "badge-warning";
            return (
              <li key={c.id} className="card-plain card-link">
                <Link
                  href={`/admin/courses/${c.id}`}
                  className="stack h-full gap-3 p-5"
                >
                  <span className={`${tone} w-fit`}>
                    {t(`status.${c.status}`)}
                  </span>
                  <span className="title-card">
                    {localized(locale, c.titleAr, c.titleEn)}
                  </span>
                  <span className="mt-auto text-sm text-muted">
                    {t("students", { count: String(c._count.enrollments) })} ·{" "}
                    {t("lectures", { count: String(c._count.lectures) })}
                  </span>
                  <span className="link text-sm">{t("manage")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
