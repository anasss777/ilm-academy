import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { listPublishedCourses } from "@/lib/read/service";
import { CourseCard } from "@/components/site/course-card";
import { Chart, Pencil, Video } from "@/components/ui/icons";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const latest = await listPublishedCourses(db, { page: 1, pageSize: 3 });

  const features = [
    { Icon: Video, title: t("f1Title"), body: t("f1Body") },
    { Icon: Pencil, title: t("f2Title"), body: t("f2Body") },
    { Icon: Chart, title: t("f3Title"), body: t("f3Body") },
  ];

  return (
    <>
      <section className="hero">
        <div className="container-page section">
          <div className="stack mx-auto max-w-3xl items-center gap-5 text-center">
            <span className="badge-primary">{t("badge")}</span>
            <h1 className="title-page">{t("heroTitle")}</h1>
            <p className="lead">{t("heroSubtitle")}</p>
            <div className="cluster justify-center">
              <Link href="/courses" className="btn-primary btn-lg">
                {t("ctaBrowse")}
              </Link>
              <Link href="/register" className="btn-outline btn-lg">
                {t("ctaRegister")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page section stack gap-8">
        <h2 className="title-section text-center">{t("featuresTitle")}</h2>
        <div className="grid3c">
          {features.map(({ Icon, title, body }) => (
            <div key={title} className="card stack gap-3">
              <span className="avatar">
                <Icon className="icon" />
              </span>
              <h3 className="title-card">{title}</h3>
              <p className="text-sm leading-7 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {latest.items.length > 0 ? (
        <section className="container-page stack gap-6 pb-10">
          <div className="flex items-end justify-between gap-4">
            <h2 className="title-section">{t("latestTitle")}</h2>
            <Link href="/courses" className="link">
              {t("viewAll")}
            </Link>
          </div>
          <div className="grid-cards">
            {latest.items.map((course) => (
              <CourseCard key={course.id} course={course} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
