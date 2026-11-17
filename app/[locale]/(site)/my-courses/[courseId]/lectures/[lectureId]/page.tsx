import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { formatDateTime } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { getLectureDetail } from "@/lib/read/service";
import { courseContext } from "@/lib/ui/context";
import { orLeave } from "@/lib/ui/data";
import { AttendanceBadge, LectureStateBadge, QuestionStatusBadge } from "@/components/student/badges";
import { ZoomCard } from "@/components/student/zoom-card";

export default async function LectureDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; lectureId: string }>;
}) {
  const ctx = await courseContext(params);
  const { locale, courseId, user, base } = ctx;
  const lectureId = parseUuid(ctx.lectureId);
  if (!lectureId) notFound();

  const t = await getTranslations("lecture");
  const ts = await getTranslations("student");
  const tq = await getTranslations("question");

  const lecture = await orLeave(getLectureDetail(db, { lectureId, viewerId: user.id }), locale);
  if (lecture.courseId !== courseId) notFound();

  const title = localized(locale, lecture.titleAr, lecture.titleEn);
  const description = localized(locale, lecture.descriptionAr, lecture.descriptionEn);

  return (
    <div className="stack gap-6">
      <Link href={`${base}/lectures`} className="link text-sm">
        {t("backToLectures")}
      </Link>

      <section className="card stack gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-muted">{ts("lectureNumber", { number: String(lecture.number) })}</span>
          <LectureStateBadge state={lecture.state} />
        </div>
        <h2 className="title-section">{title}</h2>
        <div className="stack gap-1">
          <p className="text-sm">{formatDateTime(lecture.startsAt, locale, user.timezone)}</p>
          <p className="text-xs text-muted">{ts("timezone", { tz: user.timezone })}</p>
        </div>
        {description ? <p className="prose-block text-sm">{description}</p> : null}
        {lecture.zoom ? <ZoomCard zoom={lecture.zoom} /> : null}
        <div className="cluster gap-2">
          <span className="text-sm text-muted">{t("yourAttendance")}:</span>
          <AttendanceBadge status={lecture.attendance} ended={lecture.state === "ENDED"} />
        </div>
      </section>

      <section className="stack gap-3">
        <h2 className="title-section">{t("recordings")}</h2>
        {lecture.recordings.length === 0 ? (
          <p className="text-sm text-muted">{t("noRecordings")}</p>
        ) : (
          lecture.recordings.map((r, i) => (
            <div key={r.id} className="card stack gap-3">
              <p className="title-card">
                {localized(locale, r.titleAr, r.titleEn) || t("recordingFallback", { number: String(i + 1) })}
              </p>
              {r.embedUrl ? (
                <iframe
                  src={r.embedUrl}
                  title={localized(locale, r.titleAr, r.titleEn) || title}
                  className="aspect-video w-full rounded-control border border-line"
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : null}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="link text-sm">
                {t("openRecording")}
              </a>
            </div>
          ))
        )}
      </section>

      <section className="card stack gap-3">
        <h2 className="title-section">{t("materials")}</h2>
        {lecture.materials.length === 0 ? (
          <p className="text-sm text-muted">{t("noMaterials")}</p>
        ) : (
          <ul className="stack gap-2">
            {lecture.materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{localized(locale, m.titleAr, m.titleEn)}</span>
                <a href={`/api/materials/${m.id}/download`} target="_blank" rel="noopener noreferrer" className="link shrink-0">
                  {ts("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack gap-3">
        <h2 className="title-section">{t("questions")}</h2>
        {lecture.questions.length === 0 ? (
          <p className="text-sm text-muted">{t("noQuestions")}</p>
        ) : (
          lecture.questions.map((q) => (
            <Link key={q.id} href={`${base}/questions/${q.id}`} className="card-plain card-link flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="stack gap-1">
                <span className="title-card">{tq(`types.${q.type}`)}</span>
                <span className="text-sm text-muted">
                  {q.dueAt ? t("due", { date: formatDateTime(q.dueAt, locale, user.timezone) }) : t("noDeadline")}
                </span>
              </div>
              <div className="cluster gap-2">
                <QuestionStatusBadge status={q.status} />
                <span className="link text-sm">{t("viewQuestion")}</span>
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
