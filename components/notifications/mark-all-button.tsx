"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";

export function MarkAllButton() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const res = await apiRequest("POST", "/api/me/notifications/read", { all: true });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button type="button" className="btn-outline btn-sm" onClick={onClick} disabled={busy}>
      {t("markAll")}
    </button>
  );
}
