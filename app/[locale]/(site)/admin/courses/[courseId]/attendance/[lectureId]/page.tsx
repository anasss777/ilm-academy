import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { formatDateTime } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { GradingError } from "@/lib/grading/grading";
import { listRoster } from "@/lib/staff/attendance";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { Pagination } from "@/components/site/pagination";
import { AttendanceImport } from "@/components/admin/attendance-import";
import { AttendanceSheet } from "@/components/admin/attendance-sheet";

const PAGE_SIZE = 200;

export default async function AdminAttendanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseId: string; lectureId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await adminCourseContext(params, "/attendance", "attendance.view");
  const { locale, courseId, user, perms, base } = ctx;
  const lectureId = parseUuid(ctx.lectureId);
  if (!lectureId) notFound();
  const sp = await searchParams;
  const t = await getTranslations("admin.attendance");
  const tc = await getTranslations("admin.common");
  const tl = await getTranslations("admin.lectures");
  const ti = await getTranslations("admin.attendanceImport");

  const q = (sp.q ?? "").trim().slice(0, 100) || undefined;
  const page = Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const roster = await listRoster(db, { lectureId, q, page, pageSize: PAGE_SIZE }).catch((e: unknown): never => {
    if (e instanceof GradingError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  // The lecture must belong to the course in the URL
  if (roster.lecture.courseId !== courseId) notFound();

  return (
    <div className="stack gap-6">
      <Link href={`${base}/attendance`} className="link text-sm">
        {t("back")}
      </Link>
      <div className="stack gap-1">
        <h2 className="title-section" dir="auto">
          {tl("number", { number: String(roster.lecture.number) })}: {localized(locale, roster.lecture.titleAr, roster.lecture.titleEn)}
        </h2>
        <p className="text-sm text-muted">{formatDateTime(roster.lecture.startsAt, locale, user.timezone)}</p>
      </div>

      {perms.has("attendance.import") ? (
        <details className="card">
          <summary className="cursor-pointer text-base font-semibold text-ink">{ti("title")}</summary>
          <div className="mt-4">
            <AttendanceImport
              lectureId={lectureId}
              lectureMinutes={Math.max(1, Math.round((roster.lecture.endsAt.getTime() - roster.lecture.startsAt.getTime()) / 60_000))}
            />
          </div>
        </details>
      ) : null}

      <form method="get" className="toolbar">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="label">{tc("search")}</label>
          <input id="q" name="q" type="search" defaultValue={q} className="input" />
        </div>
        <button type="submit" className="btn-outline">{tc("search")}</button>
      </form>

      {roster.items.length === 0 ? (
        <div className="empty-state">
          <p>{tc("noResults")}</p>
        </div>
      ) : (
        // key: a new search or page must start with a fresh sheet, not the previous one's edits
        <AttendanceSheet
          key={`${q ?? ""}-${page}-${roster.items.map((r) => r.status ?? "-").join(",")}`}
          lectureId={lectureId}
          canEdit={perms.has("attendance.edit")}
          rows={roster.items.map((r) => ({ userId: r.userId, fullName: r.fullName, email: r.email, status: r.status }))}
        />
      )}

      {roster.total > PAGE_SIZE ? <p className="text-sm text-muted">{t("more")}</p> : null}
      <Pagination
        pathname={`${base}/attendance/${lectureId}`}
        page={page}
        pageSize={PAGE_SIZE}
        total={roster.total}
        query={q ? { q } : {}}
      />
    </div>
  );
}
