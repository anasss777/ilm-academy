import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { formatDateTime } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { loadEligibility } from "@/lib/ui/data";
import { Calendar } from "@/components/ui/icons";

const KNOWN_ENROLL_ERRORS = ["ENROLLMENT_CLOSED", "NOT_FOUND"];

export default async function MyCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const user = await requirePageUser(locale, "/my-courses");

  const enrollments = await db.enrollment.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { enrolledAt: "desc" },
    select: {
      course: { select: { id: true, titleAr: true, titleEn: true, status: true, certificateEnabled: true } },
    },
  });
  const courses = enrollments.map((e) => e.course).filter((c) => c.status !== "DRAFT");

  // The next lecture of each course, in one query
  const upcoming = courses.length
    ? await db.lecture.findMany({
        where: {
          courseId: { in: courses.map((c) => c.id) },
          status: "PUBLISHED",
          deletedAt: null,
          endsAt: { gte: new Date() },
        },
        orderBy: { startsAt: "asc" },
        select: { courseId: true, number: true, titleAr: true, titleEn: true, startsAt: true },
      })
    : [];
  const nextBy = new Map<string, (typeof upcoming)[number]>();
  for (const l of upcoming) if (!nextBy.has(l.courseId)) nextBy.set(l.courseId, l);

  const eligibility = new Map<string, "ELIGIBLE" | "NOT_ELIGIBLE" | "PENDING">();
  await Promise.all(
    courses
      .filter((c) => c.certificateEnabled)
      .map(async (c) => {
        const { result } = await loadEligibility(user.id, c.id);
        eligibility.set(c.id, result.status);
      }),
  );

  const t = await getTranslations("myCourses");
  const ts = await getTranslations("student");
  const te = await getTranslations("enroll");
  const enrollError = sp.enroll_error
    ? te(`errors.${KNOWN_ENROLL_ERRORS.includes(sp.enroll_error) ? sp.enroll_error : "FAILED"}`)
    : null;

  return (
    <div className="container-page section stack gap-6">
      <div className="stack gap-1">
        <h1 className="title-page">{t("title")}</h1>
        <p className="lead">{t("welcome", { name: user.fullName })}</p>
      </div>

      {enrollError ? (
        <p role="alert" className="alert-warning">
          {enrollError}
        </p>
      ) : null}

      {courses.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
          <Link href="/courses" className="btn-primary">
            {te("browse")}
          </Link>
        </div>
      ) : (
        <ul className="grid-cards">
          {courses.map((course) => {
            const next = nextBy.get(course.id);
            const status = eligibility.get(course.id);
            return (
              <li key={course.id} className="card-plain card-link">
                <Link href={`/my-courses/${course.id}`} className="stack h-full gap-3 p-5">
                  <div className="cluster gap-2">
                    {status === "ELIGIBLE" ? <span className="badge-success">{t("eligible")}</span> : null}
                    {status === "PENDING" ? <span className="badge-warning">{t("pending")}</span> : null}
                    {status === "NOT_ELIGIBLE" ? <span className="badge-muted">{t("notEligible")}</span> : null}
                    {course.status === "ARCHIVED" ? <span className="badge-muted">{ts("archived")}</span> : null}
                  </div>
                  <span className="title-card">{localized(locale, course.titleAr, course.titleEn)}</span>
                  <div className="mt-auto stack gap-1 text-sm">
                    <span className="flex items-center gap-2 font-medium text-muted">
                      <Calendar className="icon" />
                      {t("nextLecture")}
                    </span>
                    <span>
                      {next
                        ? `${localized(locale, next.titleAr, next.titleEn)} · ${formatDateTime(next.startsAt, locale, user.timezone)}`
                        : t("noUpcoming")}
                    </span>
                  </div>
                  <span className="link text-sm">{t("open")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
