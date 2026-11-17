import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { listPublishedCourses } from "@/lib/read/service";
import { CourseCard } from "@/components/site/course-card";
import { Pagination } from "@/components/site/pagination";
import { Search } from "@/components/ui/icons";

const PAGE_SIZE = 12;

export default async function CoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100) || undefined;
  const page = Math.min(1000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const t = await getTranslations("catalog");
  const result = await listPublishedCourses(db, { q, page, pageSize: PAGE_SIZE });

  return (
    <div className="container-page section stack gap-8">
      <header className="stack gap-2">
        <h1 className="title-page">{t("title")}</h1>
        <p className="lead">{t("subtitle")}</p>
      </header>

      <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          {t("searchLabel")}
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} className="input flex-1" />
        <button type="submit" className="btn-primary">
          <Search className="icon" />
          {t("searchButton")}
        </button>
        {q ? (
          <Link href="/courses" className="btn-ghost">
            {t("clear")}
          </Link>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <div className="empty-state">
          <p>{q ? t("empty") : t("emptyAll")}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">{t("results", { count: formatNumber(result.total, locale) })}</p>
          <div className="grid-cards">
            {result.items.map((course) => (
              <CourseCard key={course.id} course={course} locale={locale} />
            ))}
          </div>
          <Pagination
            pathname="/courses"
            page={page}
            pageSize={PAGE_SIZE}
            total={result.total}
            query={q ? { q } : {}}
          />
        </>
      )}
    </div>
  );
}
