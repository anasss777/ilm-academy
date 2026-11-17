"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

export function RevokeRoleButton({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations("admin.team");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="stack gap-1">
      {confirming ? (
        <div className="cluster gap-2">
          <span className="text-xs">{t("revokeConfirm")}</span>
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={busy}
            onClick={() => run(() => apiRequest("DELETE", `/api/admin/user-roles/${assignmentId}`), () => router.refresh())}
          >
            {t("revokeYes")}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>
            {tc("cancel")}
          </button>
        </div>
      ) : (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(true)}>
          {t("revoke")}
        </button>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
