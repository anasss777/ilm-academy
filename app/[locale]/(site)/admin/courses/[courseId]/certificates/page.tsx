import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDateTime, formatPercent } from "@/lib/format";
import { listCertificateExports, listCertificateReviews } from "@/lib/staff/queues";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { Pagination } from "@/components/site/pagination";
import { CertificateExportPanel } from "@/components/admin/certificate-export-panel";
import { CertificateRequirementsForm } from "@/components/admin/certificate-requirements-form";
import { CertificateReviewRow } from "@/components/admin/certificate-review-row";

const PAGE_SIZE = 25;
const STATUSES = ["PENDING", "AUTO_ELIGIBLE", "AUTO_INELIGIBLE", "APPROVED", "REJECTED"] as const;

export default async function AdminCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, courseId, user, perms, base } = await adminCourseContext(params, "/certificates", "certificate.view");
  const sp = await searchParams;
  const t = await getTranslations("admin.certificates");
  const tn = await getTranslations("admin.nav");
  const tc = await getTranslations("admin.common");

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { certificateEnabled: true, attendanceEnabled: true, questionsEnabled: true, examEnabled: true },
  });
  if (!course?.certificateEnabled) {
    return (
      <div className="stack gap-3">
        <p className="alert-info">{t("notEnabled")}</p>
        <div>
          <Link href={base} className="btn-outline">
            {tn("details")}
          </Link>
        </div>
      </div>
    );
  }

  const q = (sp.q ?? "").trim().slice(0, 100) || undefined;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const needsReReview = sp.needs === "1" ? true : undefined;
  const page = Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const [reviews, exports] = await Promise.all([
    listCertificateReviews(db, { courseId, status, needsReReview, q, page, pageSize: PAGE_SIZE }),
    listCertificateExports(db, courseId),
  ]);

  const pct = (v: number | null) => (v == null ? "—" : formatPercent(v, locale));
  const th = reviews.thresholds;

  return (
    <div className="stack gap-6">
      <CertificateRequirementsForm
        courseId={courseId}
        version={reviews.requirementVersion ?? null}
        canConfigure={perms.has("certificate.configure")}
        attendanceEnabled={course.attendanceEnabled}
        questionsEnabled={course.questionsEnabled}
        examEnabled={course.examEnabled}
        initial={{
          minAttendancePercent: th?.minAttendancePercent == null ? null : Number(th.minAttendancePercent),
          minQuestionScorePercent: th?.minQuestionScorePercent == null ? null : Number(th.minQuestionScorePercent),
          minExamPercent: th?.minExamPercent == null ? null : Number(th.minExamPercent),
        }}
      />

      <section className="stack gap-4">
        <h2 className="title-section">{t("reviewTitle")}</h2>

        <form method="get" className="toolbar">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="label">{t("search")}</label>
            <input id="q" name="q" type="search" defaultValue={q} className="input" />
          </div>
          <div>
            <label htmlFor="status" className="label">{t("status")}</label>
            <select id="status" name="status" defaultValue={status ?? ""} className="select">
              <option value="">{t("all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="needs" value="1" defaultChecked={needsReReview} className="checkbox" />
            {t("needsReview")}
          </label>
          <button type="submit" className="btn-primary">{tc("search")}</button>
        </form>

        {reviews.items.length === 0 ? (
          <div className="empty-state">
            <p>{t("empty")}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                {reviews.items.map((r) => (
                  <CertificateReviewRow
                    key={r.userId}
                    courseId={courseId}
                    canReview={perms.has("certificate.review")}
                    row={{
                      userId: r.userId,
                      fullName: r.fullName,
                      email: r.email,
                      consent: r.dataSharingConsent,
                      stored: r.review?.status ?? null,
                      needsReReview: r.review?.needsReReview ?? false,
                      overrideReason: r.review?.overrideReason ?? null,
                      liveStatus: r.live.status,
                      attendanceText:
                        r.live.attendance.state === "DISABLED"
                          ? "—"
                          : `${pct(r.live.attendance.percent)} (${r.live.attendance.attended}/${r.live.attendance.heldLectures})`,
                      questionsText: r.live.questions.state === "DISABLED" ? "—" : pct(r.live.questions.percent),
                      examText: r.live.exam.state === "DISABLED" ? "—" : pct(r.live.exam.percent),
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          pathname={`${base}/certificates`}
          page={page}
          pageSize={PAGE_SIZE}
          total={reviews.total}
          query={{ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(needsReReview ? { needs: "1" } : {}) }}
        />
      </section>

      <CertificateExportPanel
        courseId={courseId}
        canExport={perms.has("certificate.export")}
        items={exports.items.map((x) => ({
          id: x.id,
          version: x.requirementVersion,
          count: x.itemCount,
          atText: formatDateTime(x.exportedAt, locale, user.timezone),
          by: x.exportedBy,
        }))}
      />
    </div>
  );
}
