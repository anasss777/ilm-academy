import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/lib/i18n-content";
import { coverImageUrl } from "@/lib/storage/rules";
import { Award } from "@/components/ui/icons";
import type { listPublishedCourses } from "@/lib/read/service";

export type CatalogCourse = Awaited<ReturnType<typeof listPublishedCourses>>["items"][number];

export async function CourseCard({ course, locale }: { course: CatalogCourse; locale: string }) {
  const t = await getTranslations("catalog");
  const title = localized(locale, course.titleAr, course.titleEn);
  const summary = localized(locale, course.shortDescAr, course.shortDescEn);
  const cover = coverImageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", course.coverImagePath);
  const href = `/courses/${encodeURIComponent(course.slug)}`;

  return (
    <article className="card-plain card-link flex flex-col">
      <Link href={href} tabIndex={-1} aria-hidden>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        ) : (
          <div className="cover-placeholder aspect-video">{title.slice(0, 1)}</div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="cluster gap-2">
          {course.certificateEnabled ? (
            <span className="badge-accent">
              <Award className="size-3.5" />
              {t("certificate")}
            </span>
          ) : null}
          {!course.enrollmentOpen ? <span className="badge-muted">{t("closed")}</span> : null}
        </div>

        <h3 className="title-card">
          <Link href={href}>{title}</Link>
        </h3>
        {summary ? <p className="line-clamp-3 text-sm leading-7 text-muted">{summary}</p> : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-sm">
          <span className="truncate text-muted">{course.instructors.join(" · ")}</span>
          <Link href={href} className="link shrink-0">
            {t("viewCourse")}
          </Link>
        </div>
      </div>
    </article>
  );
}
