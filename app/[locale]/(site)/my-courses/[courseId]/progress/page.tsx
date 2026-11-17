import { getTranslations } from "next-intl/server";
import { formatNumber, formatPercent } from "@/lib/format";
import { courseContext } from "@/lib/ui/context";
import { loadDashboard, loadEligibility, orLeave } from "@/lib/ui/data";
import { ConsentToggle } from "@/components/student/consent-toggle";
import { ProgressMeter } from "@/components/student/progress-meter";

type Tone = "primary" | "success" | "warning" | "danger";
const toneOf = (state: string): Tone =>
  state === "MET" ? "success" : state === "NOT_MET" ? "danger" : state === "PENDING" ? "warning" : "primary";
const badgeOf = (state: string) =>
  state === "MET" ? "badge-success" : state === "NOT_MET" ? "badge-danger" : "badge-warning";

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user } = await courseContext(params, "/progress");
  const t = await getTranslations("progress");
  const [dash, elig] = await Promise.all([
    orLeave(loadDashboard(user.id, courseId), locale),
    orLeave(loadEligibility(user.id, courseId), locale),
  ]);

  const f = dash.course.features;
  const r = elig.result;
  const req = elig.requirement;
  const pct = (v: number | null) => (v == null ? "—" : formatPercent(v, locale));
  const overallTone = r.status === "ELIGIBLE" ? "badge-success" : r.status === "PENDING" ? "badge-warning" : "badge-muted";

  return (
    <div className="stack gap-6">
      {f.certificate ? (
        <section className="card stack gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="title-section">{t("overall")}</h2>
            <span className={overallTone}>{t(`status.${r.status}`)}</span>
          </div>
          {r.status !== "ELIGIBLE" && r.reasons.length > 0 ? (
            <div className="stack gap-2">
              <p className="text-sm font-semibold text-ink">{t("reasonsTitle")}</p>
              <ul className="stack gap-1 text-sm text-muted">
                {r.reasons.map((code) => (
                  <li key={code}>• {t(`reasons.${code}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {elig.review?.status === "APPROVED" ? <p className="alert-success">{t("approved")}</p> : null}
          {elig.review?.status === "REJECTED" ? <p className="alert-warning">{t("rejected")}</p> : null}
        </section>
      ) : (
        <p className="alert-info">{t("noCertificate")}</p>
      )}

      <div className="grid3c items-start">
        {f.attendance ? (
          <section className="card stack gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="title-card">{t("attendance")}</h3>
              {r.attendance.state !== "DISABLED" ? <span className={badgeOf(r.attendance.state)}>{t(`state.${r.attendance.state}`)}</span> : null}
            </div>
            <span className="stat-value">{pct(r.attendance.percent)}</span>
            <ProgressMeter value={r.attendance.percent} tone={toneOf(r.attendance.state)} label={t("attendance")} />
            <p className="text-sm text-muted">
              {r.attendance.countedLectures === 0
                ? t("attendanceNone")
                : t("attendanceDetail", {
                    attended: formatNumber(r.attendance.attended, locale),
                    held: String(r.attendance.countedLectures),
                    required: r.attendance.requiredLectures == null ? "—" : String(r.attendance.requiredLectures),
                  })}
            </p>
            {req.minAttendancePercent != null ? (
              <p className="text-xs text-muted">{t("required", { value: formatPercent(req.minAttendancePercent, locale) })}</p>
            ) : null}
          </section>
        ) : null}

        {f.questions ? (
          <section className="card stack gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="title-card">{t("questions")}</h3>
              {r.questions.state !== "DISABLED" ? <span className={badgeOf(r.questions.state)}>{t(`state.${r.questions.state}`)}</span> : null}
            </div>
            <span className="stat-value">{pct(r.questions.percent)}</span>
            <ProgressMeter value={r.questions.percent} tone={toneOf(r.questions.state)} label={t("questions")} />
            <p className="text-sm text-muted">
              {r.questions.pointsAvailable === 0
                ? t("questionsNone")
                : t("questionsDetail", {
                    earned: formatNumber(r.questions.pointsEarned, locale),
                    available: formatNumber(r.questions.pointsAvailable, locale),
                  })}
              {r.questions.pointsPendingGrading > 0
                ? ` ${t("questionsPending", { pending: formatNumber(r.questions.pointsPendingGrading, locale) })}`
                : ""}
            </p>
            {req.minQuestionScorePercent != null ? (
              <p className="text-xs text-muted">{t("required", { value: formatPercent(req.minQuestionScorePercent, locale) })}</p>
            ) : null}
          </section>
        ) : null}

        {f.exam ? (
          <section className="card stack gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="title-card">{t("exam")}</h3>
              {r.exam.state !== "DISABLED" ? <span className={badgeOf(r.exam.state)}>{t(`state.${r.exam.state}`)}</span> : null}
            </div>
            <span className="stat-value">{pct(r.exam.percent)}</span>
            <ProgressMeter value={r.exam.percent} tone={toneOf(r.exam.state)} label={t("exam")} />
            <p className="text-sm text-muted">
              {r.exam.percent == null ? t("examNone") : t("examDetail", { percent: formatPercent(r.exam.percent, locale) })}
            </p>
            {req.minExamPercent != null ? (
              <p className="text-xs text-muted">{t("required", { value: formatPercent(req.minExamPercent, locale) })}</p>
            ) : null}
          </section>
        ) : null}
      </div>

      {f.certificate ? (
        <section className="card stack gap-3">
          <h2 className="title-card">{t("consentTitle")}</h2>
          <p className="text-sm text-muted">{t("consentBody")}</p>
          <ConsentToggle initial={user.dataSharingConsentAt != null} />
        </section>
      ) : null}
    </div>
  );
}
