"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { SelectField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";
import { UserPicker, type PickedUser } from "./user-picker";

export type RoleOption = { id: string; key: string; label: string };
export type CourseOption = { id: string; label: string };

/**
 * Give a person a role: pick the account, the role, and where it applies.
 * On a course page the scope is fixed to that course; on the team page you can choose.
 */
export function AssignRoleForm({
  roles,
  courses,
  fixedCourseId,
}: {
  roles: RoleOption[];
  courses?: CourseOption[];
  fixedCourseId?: string;
}) {
  const t = useTranslations("admin.team");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [picked, setPicked] = useState<PickedUser | null>(null);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [scope, setScope] = useState<"org" | "course">(fixedCourseId ? "course" : "org");
  const [courseId, setCourseId] = useState(fixedCourseId ?? courses?.[0]?.id ?? "");
  const [note, setNote] = useState<string | null>(null);

  if (roles.length === 0) return <p className="text-sm text-muted">{t("noRolesToGrant")}</p>;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked || !roleId) return;
    setNote(null);
    const target = fixedCourseId ?? (scope === "course" ? courseId : null);
    await run(
      () => apiRequest<{ outcome: "GRANTED" | "ALREADY_ASSIGNED" }>("POST", "/api/admin/user-roles", { userId: picked.id, roleId, courseId: target }),
      (d) => {
        setNote(d.outcome === "GRANTED" ? t("assigned") : t("already"));
        setPicked(null);
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-4" noValidate>
      <UserPicker value={picked} onChange={setPicked} />
      <div className="form-grid">
        <SelectField id="assign-role" label={t("role")} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </SelectField>
        {!fixedCourseId && courses && courses.length > 0 ? (
          <>
            <SelectField id="assign-scope" label={t("scope")} value={scope} onChange={(e) => setScope(e.target.value as "org" | "course")}>
              <option value="org">{t("scopeOrg")}</option>
              <option value="course">{t("scopeCourse")}</option>
            </SelectField>
            {scope === "course" ? (
              <SelectField id="assign-course" label={t("pickCourse")} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </>
        ) : null}
      </div>
      <ErrorNote error={error} />
      {note ? <p role="status" className="text-sm text-success">{note}</p> : null}
      <div>
        <button type="submit" className="btn-primary" disabled={busy || !picked}>
          {busy ? t("assigning") : t("assign")}
        </button>
      </div>
    </form>
  );
}
