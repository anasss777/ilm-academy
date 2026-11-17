import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { requirePagePermission } from "@/lib/auth/page-permissions";
import { listRoles } from "@/lib/staff/team";
import { roleLabel } from "@/lib/ui/role-label";
import { CreateRoleForm } from "@/components/admin/create-role-form";
import { RolePermissionsForm } from "@/components/admin/role-permissions-form";

export default async function RolesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser(locale, "/admin/roles");
  const perms = await requirePagePermission(locale, user.id, "role.manage");
  const t = await getTranslations("admin.roles");
  const tn = await getTranslations("admin.nav");
  const tt = await getTranslations("admin.team");

  const roles = await listRoles(db);
  const actorPerms = [...perms];

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
        {perms.has("user.manage") ? (
          <Link href="/admin/team" className="btn-outline">
            {tt("title")}
          </Link>
        ) : null}
      </div>

      {roles.map((r) => (
        <RolePermissionsForm
          key={r.id}
          actorPerms={actorPerms}
          role={{ id: r.id, key: r.key, label: roleLabel(t, r.key, r.name), isSystem: r.isSystem, members: r.members, permissions: r.permissions }}
        />
      ))}

      <CreateRoleForm actorPerms={actorPerms} />
    </div>
  );
}
