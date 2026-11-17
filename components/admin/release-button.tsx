"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

/** POST to a "release grades" endpoint (a question's held grades, or a graded exam's attempts). */
export function ReleaseButton({ url, label }: { url: string; label: string }) {
  const t = useTranslations("admin.grading");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [count, setCount] = useState<number | null>(null);

  return (
    <div className="stack gap-2">
      <div className="cluster">
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={busy}
          onClick={() =>
            run(
              () => apiRequest<{ released: number }>("POST", url),
              (d) => {
                setCount(d.released);
                router.refresh();
              },
            )
          }
        >
          {label}
        </button>
        {count != null ? <span className="text-sm text-success">{t("released", { count: String(count) })}</span> : null}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}
