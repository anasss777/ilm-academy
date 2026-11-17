import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatPercent } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { courseContext } from "@/lib/ui/context";
import { loadDashboard, loadEligibility, orLeave } from "@/lib/ui/data";
import { LectureStateBadge } from "@/components/student/badges";
import { ProgressMeter } from "@/components/student/progress-meter";
import { WithdrawButton } from "@/components/student/withdraw-button";
import { ZoomCard } from "@/components/student/zoom-card";

export default async function CourseHomePage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, base } = await courseContext(params);
  const t = await getTranslations("student");
  const [dash, elig] = await Promise.all([
    orLeave(loadDashboard(user.id, courseId), locale),
    orLeave(loadEligibility(user.id, courseId), locale),
  ]);

  const next = dash.nextLecture;
  const f = dash.course.features;
  const r = elig.result;
  const pct = (v: number | null) => (v == null ? "—" : formatPercent(v, locale));

  const stats = [
    f.attendance && { label: t("statAttendance"), value: r.attendance.percent },
    f.questions && { label: t("statQuestions"), value: r.questions.percent },
    f.exam && { label: t("statExam"), value: r.exam.percent },
  ].filter((s): s is { label: string; value: number | null } => s !== false);

  return (
    <div className="stack gap-6">
      <section className="card stack gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-section">{t("nextLecture")}</h2>
          {next ? <LectureStateBadge state={next.state} /> : null}
        </div>
        {next ? (
          <>
            <div className="stack gap-1">
              <p className="title-card">
                {t("lectureNumber", { number: String(next.number) })}: {localized(locale, next.titleAr, next.titleEn)}
              </p>
              <p className="text-sm">{formatDateTime(next.startsAt, locale, user.timezone)}</p>
              <p className="text-xs text-muted">{t("timezone", { tz: user.timezone })}</p>
            </div>
            {next.zoom ? <ZoomCard zoom={next.zoom} /> : null}
            <div>
              <Link href={`${base}/lectures/${next.id}`} className="btn-outline">
                {t("openLecture")}
              </Link>
            </div>
          </>
        ) : (
          <p className="text-muted">{t("noUpcoming")}</p>
        )}
      </section>

      {stats.length > 0 ? (
        <section className="stack gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="title-section">{t("snapshot")}</h2>
            <Link href={`${base}/progress`} className="link text-sm">
              {t("viewProgress")}
            </Link>
          </div>
          <div className="grid3c">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <span className="stat-value">{pct(s.value)}</span>
                <span className="stat-label">{s.label}</span>
                <ProgressMeter value={s.value} label={s.label} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {f.exam && dash.examId ? (
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <h2 className="title-card">{t("examCardTitle")}</h2>
          <Link href={`${base}/exam`} className="btn-outline">
            {t("openExam")}
          </Link>
        </section>
      ) : null}

      <section className="card stack gap-3">
        <h2 className="title-section">{t("materials")}</h2>
        {dash.materials.length === 0 ? (
          <p className="text-sm text-muted">{t("noMaterials")}</p>
        ) : (
          <ul className="stack gap-2">
            {dash.materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{localized(locale, m.titleAr, m.titleEn)}</span>
                <a href={`/api/materials/${m.id}/download`} target="_blank" rel="noopener noreferrer" className="link shrink-0">
                  {t("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WithdrawButton courseId={courseId} />
    </div>
  );
}
