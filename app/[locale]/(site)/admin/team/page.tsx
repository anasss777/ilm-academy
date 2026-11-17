import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { requirePagePermission } from "@/lib/auth/page-permissions";
import { formatDate } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { listAssignments, listRoles } from "@/lib/staff/team";
import { grantableRoles } from "@/lib/staff/team-rules";
import { roleLabel } from "@/lib/ui/role-label";
import { AssignRoleForm } from "@/components/admin/assign-role-form";
import { RevokeRoleButton } from "@/components/admin/revoke-role-button";

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser(locale, "/admin/team");
  const perms = await requirePagePermission(locale, user.id, "user.manage");
  const t = await getTranslations("admin.team");
  const tr = await getTranslations("admin.roles");
  const tn = await getTranslations("admin.nav");

  const [roles, assignments, courses] = await Promise.all([
    listRoles(db),
    listAssignments(db),
    db.course.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, titleAr: true, titleEn: true } }),
  ]);

  const grantable = grantableRoles(roles, perms).map((r) => ({ id: r.id, key: r.key, label: roleLabel(tr, r.key, r.name) }));

  // One row per person, with all of their roles
  const byUser = new Map<string, { user: (typeof assignments)[number]["user"]; items: typeof assignments }>();
  for (const a of assignments) {
    const entry = byUser.get(a.user.id) ?? { user: a.user, items: [] };
    entry.items.push(a);
    byUser.set(a.user.id, entry);
  }
  const people = [...byUser.values()].sort((a, b) => a.user.fullName.localeCompare(b.user.fullName));

  return (
    <div className="container-page section stack gap-6">
      <Link href="/admin" className="link text-sm">
        {tn("dashboard")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="stack gap-1">
          <h1 className="title-page">{t("title")}</h1>
          <p className="lead">{t("subtitle")}</p>
        </div>
        {perms.has("role.manage") ? (
          <Link href="/admin/roles" className="btn-outline">
            {t("rolesLink")}
          </Link>
        ) : null}
      </div>

      <section className="card stack gap-4">
        <h2 className="title-card">{t("addTitle")}</h2>
        <AssignRoleForm
          roles={grantable}
          courses={courses.map((c) => ({ id: c.id, label: localized(locale, c.titleAr, c.titleEn) }))}
        />
      </section>

      <section className="stack gap-3">
        <h2 className="title-section">{t("listTitle")}</h2>
        {people.length === 0 ? (
          <div className="empty-state">
            <p>{t("empty")}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("member")}</th>
                  <th>{t("roles")}</th>
                </tr>
              </thead>
              <tbody>
                {people.map(({ user: u, items }) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium text-ink" dir="auto">{u.fullName}</div>
                      <div className="text-xs text-muted" dir="ltr">{u.email}</div>
                    </td>
                    <td>
                      <div className="stack gap-2">
                        {items.map((a) => (
                          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="cluster gap-2">
                              <span className="badge-primary">{roleLabel(tr, a.role.key, a.role.name)}</span>
                              <span className="text-sm text-muted" dir="auto">
                                {a.course ? localized(locale, a.course.titleAr, a.course.titleEn) : t("orgWide")}
                              </span>
                              <span className="text-xs text-muted">{formatDate(a.createdAt, locale, user.timezone)}</span>
                            </div>
                            <RevokeRoleButton assignmentId={a.id} />
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
