import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { adminCourseContext } from "@/lib/ui/admin-context";

export default async function AdminAttendanceListPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, base } = await adminCourseContext(params, "/attendance", "attendance.view");
  const t = await getTranslations("admin.attendance");
  const tl = await getTranslations("admin.lectures");

  const lectures = await db.lecture.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { number: "desc" },
    select: { id: true, number: true, titleAr: true, titleEn: true, startsAt: true, endsAt: true },
  });

  return (
    <div className="stack gap-4">
      <h2 className="title-section">{t("pick")}</h2>
      {lectures.length === 0 ? (
        <div className="empty-state">
          <p>{t("noLectures")}</p>
        </div>
      ) : (
        <ul className="stack gap-3">
          {lectures.map((l) => (
            <li key={l.id} className="card-plain card-link">
              <Link href={`${base}/attendance/${l.id}`} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="stack gap-1">
                  <span className="text-sm font-semibold text-muted">{tl("number", { number: String(l.number) })}</span>
                  <span className="title-card" dir="auto">{localized(locale, l.titleAr, l.titleEn)}</span>
                  <span className="text-sm text-muted">{formatDateTime(l.startsAt, locale, user.timezone)}</span>
                </div>
                <span className="link text-sm">{t("record")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
