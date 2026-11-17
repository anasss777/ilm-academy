import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listCourseStudents } from "@/lib/staff/students";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { Pagination } from "@/components/site/pagination";
import { AddStudentForm, StudentRowActions } from "@/components/admin/students-toolbar";

const PAGE_SIZE = 25;

export default async function AdminStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, courseId, user, perms, base } = await adminCourseContext(params, "/students", "student.view");
  const sp = await searchParams;
  const t = await getTranslations("admin.students");
  const tc = await getTranslations("admin.common");

  const q = (sp.q ?? "").trim().slice(0, 100) || undefined;
  const status = sp.status === "ACTIVE" || sp.status === "WITHDRAWN" ? sp.status : undefined;
  const page = Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const result = await listCourseStudents(db, { courseId, q, status, page, pageSize: PAGE_SIZE });
  const canManage = perms.has("enrollment.manage");

  return (
    <div className="stack gap-6">
      {canManage ? <AddStudentForm courseId={courseId} /> : null}

      <form method="get" className="toolbar">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="label">{t("search")}</label>
          <input id="q" name="q" type="search" defaultValue={q} className="input" />
        </div>
        <div>
          <label htmlFor="status" className="label">{t("filter")}</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="select">
            <option value="">{t("all")}</option>
            <option value="ACTIVE">{t("active")}</option>
            <option value="WITHDRAWN">{t("withdrawn")}</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">{tc("search")}</button>
      </form>

      <p className="text-sm text-muted">{t("total", { count: String(result.total) })}</p>

      {result.items.length === 0 ? (
        <div className="empty-state">
          <p>{q || status ? tc("noResults") : t("empty")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("phone")}</th>
                <th>{t("country")}</th>
                <th>{t("enrolled")}</th>
                <th>{t("consent")}</th>
                <th>{tc("none")}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((s) => (
                <tr key={s.userId}>
                  <td>
                    <div className="font-medium text-ink" dir="auto">{s.fullName}</div>
                    <div className="text-xs text-muted" dir="ltr">{s.email}</div>
                    {s.status === "WITHDRAWN" ? <span className="badge-muted mt-1">{t("withdrawn")}</span> : null}
                  </td>
                  <td dir="ltr" className="text-start">{s.phone}</td>
                  <td>{s.country}</td>
                  <td>{formatDate(s.enrolledAt, locale, user.timezone)}</td>
                  <td>
                    <span className={s.dataSharingConsent ? "badge-success" : "badge-muted"}>
                      {s.dataSharingConsent ? t("yes") : t("no")}
                    </span>
                  </td>
                  <td>{canManage ? <StudentRowActions courseId={courseId} userId={s.userId} status={s.status} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        pathname={`${base}/students`}
        page={page}
        pageSize={PAGE_SIZE}
        total={result.total}
        query={{ ...(q ? { q } : {}), ...(status ? { status } : {}) }}
      />
    </div>
  );
}
