import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { adminCourseContext } from "@/lib/ui/admin-context";

export default async function AdminLecturesPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, user, perms, base } = await adminCourseContext(params, "/lectures", "lecture.edit");
  const t = await getTranslations("admin.lectures");

  const lectures = await db.lecture.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { number: "asc" },
    select: { id: true, number: true, titleAr: true, titleEn: true, startsAt: true, status: true },
  });

  return (
    <div className="stack gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="title-section">{t("title")}</h2>
        {perms.has("lecture.create") ? (
          <Link href={`${base}/lectures/new`} className="btn-primary">
            {t("add")}
          </Link>
        ) : null}
      </div>

      {lectures.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {lectures.map((l) => (
                <tr key={l.id}>
                  <td className="w-24 font-semibold text-muted">{t("number", { number: String(l.number) })}</td>
                  <td>
                    <div className="font-medium text-ink" dir="auto">{localized(locale, l.titleAr, l.titleEn)}</div>
                    <div className="text-xs text-muted">{formatDateTime(l.startsAt, locale, user.timezone)}</div>
                  </td>
                  <td>
                    <span className={l.status === "PUBLISHED" ? "badge-success" : "badge-warning"}>
                      {l.status === "PUBLISHED" ? t("published") : t("draft")}
                    </span>
                  </td>
                  <td className="text-end">
                    <Link href={`${base}/lectures/${l.id}`} className="link text-sm">
                      {t("manage")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
