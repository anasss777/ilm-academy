"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote, SavedNote } from "./save-status";
import { PermissionPicker } from "./permission-picker";
import { useSave } from "./use-save";

export type RoleCard = {
  id: string;
  key: string;
  label: string;
  isSystem: boolean;
  members: number;
  permissions: string[];
};

/** One role: its permissions as checkboxes, and delete (custom roles nobody holds). */
export function RolePermissionsForm({ role, actorPerms }: { role: RoleCard; actorPerms: string[] }) {
  const t = useTranslations("admin.roles");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const save = useSave();
  const del = useSave();
  const [selected, setSelected] = useState(() => new Set(role.permissions));
  const [confirming, setConfirming] = useState(false);

  const locked = role.key === "owner" || role.key === "student";

  return (
    <section className="card stack gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="title-card">{role.label}</h2>
        <div className="cluster gap-2">
          <span className={role.isSystem ? "badge-primary" : "badge-muted"}>{role.isSystem ? t("system") : t("custom")}</span>
          <span className="badge-muted">{t("members", { count: String(role.members) })}</span>
        </div>
      </div>

      {role.key === "owner" ? <p className="alert-info">{t("ownerLocked")}</p> : null}
      {role.key === "student" ? <p className="alert-info">{t("studentNote")}</p> : null}

      <PermissionPicker
        selected={role.key === "owner" ? new Set(role.permissions) : selected}
        onChange={setSelected}
        actorPerms={new Set(actorPerms)}
        locked={locked}
        idPrefix={`role-${role.id}`}
      />

      {!locked ? (
        <div className="stack gap-3">
          <ErrorNote error={save.error} />
          <SavedNote saved={save.saved} text={t("saved")} />
          <div className="cluster">
            <button
              type="button"
              className="btn-primary"
              disabled={save.busy}
              onClick={() =>
                save.run(
                  () => apiRequest("PATCH", `/api/admin/roles/${role.id}`, { permissions: [...selected] }),
                  () => router.refresh(),
                )
              }
            >
              {save.busy ? t("saving") : t("save")}
            </button>

            {!role.isSystem ? (
              role.members > 0 ? (
                <span className="text-sm text-muted">{t("deleteBlocked")}</span>
              ) : confirming ? (
                <>
                  <span className="text-sm">{t("deleteConfirm")}</span>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    disabled={del.busy}
                    onClick={() => del.run(() => apiRequest("DELETE", `/api/admin/roles/${role.id}`), () => router.refresh())}
                  >
                    {tc("confirmDelete")}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                    {tc("cancel")}
                  </button>
                </>
              ) : (
                <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
                  {t("delete")}
                </button>
              )
            ) : null}
          </div>
          <ErrorNote error={del.error} />
        </div>
      ) : null}
    </section>
  );
}
