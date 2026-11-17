import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { localized } from "@/lib/i18n-content";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { TabLink } from "@/components/student/tab-link";

export default async function AdminCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, perms, base } = await adminCourseContext(params);
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { titleAr: true, titleEn: true, status: true },
  });
  if (!course) notFound();

  const t = await getTranslations("admin.nav");
  const td = await getTranslations("admin.dashboard");
  const tone = course.status === "PUBLISHED" ? "badge-success" : course.status === "ARCHIVED" ? "badge-muted" : "badge-warning";

  return (
    <div className="container-page section stack gap-6">
      <div className="stack gap-3">
        <Link href="/admin" className="link text-sm">
          {t("dashboard")}
        </Link>
        <div className="cluster">
          <h1 className="title-page">{localized(locale, course.titleAr, course.titleEn)}</h1>
          <span className={tone}>{td(`status.${course.status}`)}</span>
        </div>
      </div>

      <nav className="tabs" aria-label={t("details")}>
        {perms.has("course.edit") ? (
          <TabLink href={base} exact>
            {t("details")}
          </TabLink>
        ) : null}
        {perms.has("lecture.edit") ? <TabLink href={`${base}/lectures`}>{t("lectures")}</TabLink> : null}
        {perms.has("student.view") ? <TabLink href={`${base}/students`}>{t("students")}</TabLink> : null}
        {perms.has("attendance.view") ? <TabLink href={`${base}/attendance`}>{t("attendance")}</TabLink> : null}
        {perms.has("question.edit") ? <TabLink href={`${base}/questions`}>{t("questions")}</TabLink> : null}
        {perms.has("exam.edit") ? <TabLink href={`${base}/exam`}>{t("exam")}</TabLink> : null}
        {perms.has("submission.view") || perms.has("exam.grade") ? <TabLink href={`${base}/grading`}>{t("grading")}</TabLink> : null}
        {perms.has("certificate.view") ? <TabLink href={`${base}/certificates`}>{t("certificates")}</TabLink> : null}
        {perms.has("report.view") ? <TabLink href={`${base}/reports`}>{t("reports")}</TabLink> : null}
      </nav>

      {children}
    </div>
  );
}
