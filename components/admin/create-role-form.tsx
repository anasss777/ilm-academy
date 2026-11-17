"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { PermissionPicker } from "./permission-picker";
import { useSave } from "./use-save";

export function CreateRoleForm({ actorPerms }: { actorPerms: string[] }) {
  const t = useTranslations("admin.roles");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(
      () => apiRequest("POST", "/api/admin/roles", { key: key.trim(), name: name.trim(), permissions: [...selected] }),
      () => {
        setKey("");
        setName("");
        setSelected(new Set());
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="card stack gap-4" noValidate>
      <div className="stack gap-1">
        <h2 className="title-card">{t("createTitle")}</h2>
        <p className="text-sm text-muted">{t("createHint")}</p>
      </div>
      <div className="form-grid">
        <TextField id="new-role-key" label={t("key")} hint={t("keyHint")} dir="ltr" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} />
        <TextField id="new-role-name" label={t("name")} dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <PermissionPicker selected={selected} onChange={setSelected} actorPerms={new Set(actorPerms)} locked={false} idPrefix="new-role" />
      <ErrorNote error={error} />
      <div>
        <button type="submit" className="btn-primary" disabled={busy || key.trim().length < 3 || name.trim().length < 2}>
          {busy ? t("creating") : t("create")}
        </button>
      </div>
    </form>
  );
}
