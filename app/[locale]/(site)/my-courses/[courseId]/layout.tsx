import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/lib/i18n-content";
import { courseContext } from "@/lib/ui/context";
import { loadDashboard, orLeave } from "@/lib/ui/data";
import { TabLink } from "@/components/student/tab-link";

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, base } = await courseContext(params);
  const dash = await orLeave(loadDashboard(user.id, courseId), locale);
  const t = await getTranslations("student");

  const f = dash.course.features;
  return (
    <div className="container-page section stack gap-6">
      <div className="stack gap-3">
        <Link href="/my-courses" className="link text-sm">
          {t("back")}
        </Link>
        <div className="cluster">
          <h1 className="title-page">{localized(locale, dash.course.titleAr, dash.course.titleEn)}</h1>
          {dash.course.status === "ARCHIVED" ? <span className="badge-muted">{t("archived")}</span> : null}
        </div>
      </div>

      <nav className="tabs" aria-label={t("tabsLabel")}>
        <TabLink href={base} exact>{t("tabOverview")}</TabLink>
        <TabLink href={`${base}/lectures`}>{t("tabLectures")}</TabLink>
        {f.questions ? <TabLink href={`${base}/questions`}>{t("tabQuestions")}</TabLink> : null}
        {f.exam && dash.examId ? <TabLink href={`${base}/exam`}>{t("tabExam")}</TabLink> : null}
        <TabLink href={`${base}/progress`}>{t("tabProgress")}</TabLink>
      </nav>

      {children}
    </div>
  );
}
