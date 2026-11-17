import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { listAssignments, listRoles } from "@/lib/staff/team";
import { grantableRoles } from "@/lib/staff/team-rules";
import { roleLabel } from "@/lib/ui/role-label";
import { AssignRoleForm } from "./assign-role-form";
import { RevokeRoleButton } from "./revoke-role-button";

/** The team of one course: who is listed as an instructor, and who holds a role for this course. */
export async function CourseTeamSection({
  courseId,
  perms,
  publicInstructors,
}: {
  courseId: string;
  perms: ReadonlySet<string>;
  publicInstructors: { fullName: string; email: string }[];
}) {
  const t = await getTranslations("admin.team");
  const tr = await getTranslations("admin.roles");
  const canManage = perms.has("user.manage");

  const [assignments, roles] = await Promise.all([
    listAssignments(db, { courseId }),
    canManage ? listRoles(db) : Promise.resolve([]),
  ]);
  const grantable = grantableRoles(roles, perms).map((r) => ({ id: r.id, key: r.key, label: roleLabel(tr, r.key, r.name) }));

  return (
    <section className="card stack gap-4">
      <div className="stack gap-1">
        <h2 className="title-card">{t("courseTeam")}</h2>
        <p className="text-sm text-muted">{t("courseTeamHint")}</p>
      </div>

      <div className="stack gap-2">
        <h3 className="text-sm font-semibold text-ink">{t("publicInstructors")}</h3>
        {publicInstructors.length === 0 ? (
          <p className="text-sm text-muted">{t("noTeam")}</p>
        ) : (
          <ul className="stack gap-1 text-sm">
            {publicInstructors.map((i) => (
              <li key={i.email}>
                <span className="font-medium text-ink" dir="auto">{i.fullName}</span>{" "}
                <span className="text-muted" dir="ltr">({i.email})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {assignments.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="font-medium text-ink" dir="auto">{a.user.fullName}</div>
                    <div className="text-xs text-muted" dir="ltr">{a.user.email}</div>
                  </td>
                  <td>
                    <div className="cluster gap-2">
                      <span className="badge-primary">{roleLabel(tr, a.role.key, a.role.name)}</span>
                      {a.role.key === "instructor" ? <span className="badge-success">{t("listedPublicly")}</span> : null}
                    </div>
                  </td>
                  <td className="text-end">{canManage ? <RevokeRoleButton assignmentId={a.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {canManage ? (
        <div className="stack gap-3 border-t border-line pt-4">
          <h3 className="font-semibold text-ink">{t("addTitle")}</h3>
          <AssignRoleForm roles={grantable} fixedCourseId={courseId} />
        </div>
      ) : (
        <p className="text-sm text-muted">{t("readOnly")}</p>
      )}
    </section>
  );
}
