import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { courseContext } from "@/lib/ui/context";
import { loadLectures, orLeave } from "@/lib/ui/data";
import { AttendanceBadge, LectureStateBadge, QuestionStatusBadge } from "@/components/student/badges";
import { Video } from "@/components/ui/icons";

export default async function LecturesPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, base } = await courseContext(params, "/lectures");
  const t = await getTranslations("lectures");
  const ts = await getTranslations("student");
  const { lectures } = await orLeave(loadLectures(user.id, courseId), locale);

  type Row = (typeof lectures)[number];
  const upcoming = lectures.filter((l) => l.state !== "ENDED");
  const past = lectures.filter((l) => l.state === "ENDED").reverse();

  const row = (l: Row) => (
    <li key={l.id} className="card-plain card-link">
      <Link href={`${base}/lectures/${l.id}`} className="stack gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-muted">{ts("lectureNumber", { number: String(l.number) })}</span>
          <LectureStateBadge state={l.state} />
        </div>
        <span className="title-card">{localized(locale, l.titleAr, l.titleEn)}</span>
        <span className="text-sm text-muted">{formatDateTime(l.startsAt, locale, user.timezone)}</span>
        <div className="cluster gap-2">
          <AttendanceBadge status={l.attendance} ended={l.state === "ENDED"} />
          {l.recordingCount > 0 ? (
            <span className="badge-primary">
              <Video className="size-3.5" />
              {t("recordings", { count: String(l.recordingCount) })}
            </span>
          ) : null}
          {l.questions.map((q) => (
            <QuestionStatusBadge key={q.id} status={q.status} />
          ))}
        </div>
      </Link>
    </li>
  );

  if (lectures.length === 0) {
    return (
      <div className="empty-state">
        <p>{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="stack gap-8">
      {upcoming.length > 0 ? (
        <section className="stack gap-3">
          <h2 className="title-section">{t("upcomingGroup")}</h2>
          <ul className="stack gap-3">{upcoming.map(row)}</ul>
        </section>
      ) : null}
      {past.length > 0 ? (
        <section className="stack gap-3">
          <h2 className="title-section">{t("pastGroup")}</h2>
          <ul className="stack gap-3">{past.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
