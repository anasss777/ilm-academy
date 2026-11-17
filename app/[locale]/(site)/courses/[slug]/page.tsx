import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { getPageUser } from "@/lib/auth/page";
import { formatDateTime, formatPercent, languageName } from "@/lib/format";
import { GradingError } from "@/lib/grading/grading";
import { localized } from "@/lib/i18n-content";
import { getCourseOverviewBySlug } from "@/lib/read/service";
import { coverImageUrl } from "@/lib/storage/rules";
import { EnrollButton } from "@/components/enroll-button";
import { Award, Calendar, Check, Globe, Pencil } from "@/components/ui/icons";

// Arabic slugs arrive percent-encoded
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const c = await getCourseOverviewBySlug(db, {
      slug: decode(slug),
      viewerId: null,
    });
    return {
      title: localized(locale, c.titleAr, c.titleEn),
      description: localized(locale, c.shortDescAr, c.shortDescEn) || undefined,
    };
  } catch {
    return {};
  }
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const viewer = await getPageUser();
  const course = await getCourseOverviewBySlug(db, {
    slug: decode(slug),
    viewerId: viewer?.id ?? null,
  }).catch((e: unknown): never => {
    if (e instanceof GradingError && e.code === "NOT_FOUND") notFound();
    throw e;
  });

  const t = await getTranslations("course");
  const pick = (ar: string | null, en: string | null) =>
    localized(locale, ar, en);

  const title = pick(course.titleAr, course.titleEn);
  const summary = pick(course.shortDescAr, course.shortDescEn);
  const description = pick(course.descriptionAr, course.descriptionEn);
  const audience = pick(course.targetAudienceAr, course.targetAudienceEn);
  const prerequisites = pick(course.prerequisitesAr, course.prerequisitesEn);
  const format = pick(course.formatAr, course.formatEn);
  const frequency = pick(course.lectureFrequencyAr, course.lectureFrequencyEn);
  const cover = coverImageUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    course.coverImagePath,
  );

  // The student's own time zone when signed in, otherwise the lecture's
  const next = course.nextLecture;
  const tz = viewer?.timezone ?? next?.timezone ?? undefined;

  const cert = course.certificate;
  const requirements = [
    cert?.minAttendancePercent != null &&
      t("reqAttendance", {
        value: formatPercent(cert.minAttendancePercent, locale),
      }),
    cert?.minQuestionScorePercent != null &&
      t("reqQuestions", {
        value: formatPercent(cert.minQuestionScorePercent, locale),
      }),
    cert?.minExamPercent != null &&
      t("reqExam", { value: formatPercent(cert.minExamPercent, locale) }),
  ].filter((line): line is string => typeof line === "string");

  const includes = [
    [course.features.attendance, t("fAttendance")],
    [course.features.recordings, t("fRecordings")],
    [course.features.questions, t("fQuestions")],
    [course.features.exam, t("fExam")],
    [course.features.certificate, t("certificate")],
  ].filter(([on]) => on) as [boolean, string][];

  let action: ReactNode;
  if (course.viewer.enrolled) {
    action = <EnrollButton courseId={course.id} signedIn enrolled />;
  } else if (!course.enrollmentOpen) {
    action = <p className="alert-warning">{t("enrollClosed")}</p>;
  } else {
    action = (
      <EnrollButton
        courseId={course.id}
        signedIn={course.viewer.signedIn}
        enrolled={false}
      />
    );
  }

  return (
    <>
      <section className="hero">
        <div className="container-page section grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div className="stack gap-4">
            <div className="cluster gap-2">
              <span className="badge-success">{t("free")}</span>
              {course.features.certificate ? (
                <span className="badge-accent">
                  <Award className="size-3.5" />
                  {t("certificate")}
                </span>
              ) : null}
              {course.status === "ARCHIVED" ? (
                <span className="badge-muted">{t("archived")}</span>
              ) : null}
            </div>
            <h1 className="title-page">{title}</h1>
            {summary ? <p className="lead">{summary}</p> : null}
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <Globe className="icon" />
                {t("language")}: {languageName(locale, course.language)}
              </li>
              {format ? (
                <li className="flex items-center gap-2">
                  <Pencil className="icon" />
                  {format}
                </li>
              ) : null}
              {frequency ? (
                <li className="flex items-center gap-2">
                  <Calendar className="icon" />
                  {frequency}
                </li>
              ) : null}
            </ul>
            {course.instructors.length > 0 ? (
              <p className="text-sm text-muted">
                {course.instructors.map((i) => i.fullName).join(" · ")}
              </p>
            ) : null}
          </div>

          <aside className="card-plain lg:sticky lg:top-24">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="cover-placeholder aspect-video">
                {title.slice(0, 1)}
              </div>
            )}
            <div className="stack gap-4 p-5">
              {action}
              {includes.length > 0 ? (
                <div className="stack gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {t("includes")}
                  </p>
                  <ul className="stack gap-2 text-sm text-muted">
                    {includes.map(([, label]) => (
                      <li key={label} className="flex items-center gap-2">
                        <Check className="icon text-primary" />
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>

      <div className="container-page section">
        <div className="stack max-w-3xl gap-10">
          {description ? (
            <section className="stack gap-3">
              <h2 className="title-section">{t("about")}</h2>
              <p className="prose-block">{description}</p>
            </section>
          ) : null}

          {course.objectives.length > 0 ? (
            <section className="stack gap-3">
              <h2 className="title-section">{t("objectives")}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {course.objectives.map((o, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm leading-7"
                  >
                    <Check className="icon mt-1 text-primary" />
                    {pick(o.textAr, o.textEn)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {audience || prerequisites ? (
            <section className="grid2c items-start">
              {audience ? (
                <div className="card stack gap-2">
                  <h3 className="title-card">{t("audience")}</h3>
                  <p className="prose-block text-sm">{audience}</p>
                </div>
              ) : null}
              {prerequisites ? (
                <div className="card stack gap-2">
                  <h3 className="title-card">{t("prerequisites")}</h3>
                  <p className="prose-block text-sm">{prerequisites}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="card stack gap-3">
            <h2 className="title-section flex items-center gap-2">
              <Award className="icon text-accent" />
              {t("certificate")}
            </h2>
            {course.features.certificate ? (
              <>
                <p className="text-sm text-muted">{t("certificateIntro")}</p>
                {requirements.length > 0 ? (
                  <ul className="stack gap-2 text-sm">
                    {requirements.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <Check className="icon text-primary" />
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">{t("noCertificate")}</p>
            )}
          </section>

          <section className="card stack gap-3">
            <h2 className="title-section flex items-center gap-2">
              <Calendar className="icon text-primary" />
              {t("schedule")}
            </h2>
            {next ? (
              <div className="stack gap-1">
                <p className="text-sm font-semibold text-muted">
                  {t("nextLecture")}
                </p>
                <p className="title-card">
                  {t("lectureNumber", { number: String(next.number) })}:{" "}
                  {pick(next.titleAr, next.titleEn)}
                </p>
                <p className="text-sm">
                  {formatDateTime(next.startsAt, locale, tz)}
                </p>
                {tz ? (
                  <p className="text-xs text-muted">{t("timezone", { tz })}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted">{t("noUpcoming")}</p>
            )}
          </section>

          {course.instructors.length > 0 ? (
            <section className="stack gap-3">
              <h2 className="title-section">{t("instructors")}</h2>
              <div className="stack gap-3">
                {course.instructors.map((i) => (
                  <div key={i.fullName} className="card flex items-start gap-4">
                    <span className="avatar">{i.fullName.slice(0, 1)}</span>
                    <div className="stack gap-1">
                      <p className="title-card">{i.fullName}</p>
                      {pick(i.bioAr, i.bioEn) ? (
                        <p className="prose-block text-sm">
                          {pick(i.bioAr, i.bioEn)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {course.faqs.length > 0 ? (
            <section className="stack gap-3">
              <h2 className="title-section">{t("faq")}</h2>
              <div className="stack gap-2">
                {course.faqs.map((f, i) => (
                  <details key={i} className="faq-item">
                    <summary className="faq-q">
                      {pick(f.questionAr, f.questionEn)}
                    </summary>
                    <p className="prose-block px-4 pb-4 text-sm">
                      {pick(f.answerAr, f.answerEn)}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
