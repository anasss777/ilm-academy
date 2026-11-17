"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

export type ExportItem = { id: string; version: number; count: number; atText: string; by: string };

/** Create a snapshot export of the approved, up-to-date, consenting students; download earlier ones. */
export function CertificateExportPanel({
  courseId,
  items,
  canExport,
}: {
  courseId: string;
  items: ExportItem[];
  canExport: boolean;
}) {
  const t = useTranslations("admin.certificates");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [note, setNote] = useState<{ count: number; skipped: number } | null>(null);

  return (
    <section className="card stack gap-4">
      <h2 className="title-card">{t("exportTitle")}</h2>
      <p className="text-sm text-muted">{t("exportIntro")}</p>

      {canExport ? (
        <div className="stack gap-2">
          <div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    apiRequest<{ exportId: string; itemCount: number; skippedNoConsent: number }>(
                      "POST",
                      `/api/courses/${courseId}/certificate-exports`,
                    ),
                  (d) => {
                    setNote({ count: d.itemCount, skipped: d.skippedNoConsent });
                    router.refresh();
                  },
                )
              }
            >
              {busy ? t("creating") : t("createExport")}
            </button>
          </div>
          <ErrorNote error={error} />
          {note ? (
            <div role="status" className="stack gap-1 text-sm">
              <p className="text-success">{t("created", { count: String(note.count) })}</p>
              {note.skipped > 0 ? <p className="text-muted">{t("skipped", { count: String(note.skipped) })}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="stack gap-2 border-t border-line pt-4">
        <h3 className="font-semibold text-ink">{t("history")}</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="stack gap-2">
            {items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3 text-sm">
                <div className="stack gap-0.5">
                  <span className="font-medium text-ink">{x.atText}</span>
                  <span className="text-muted">{t("exportMeta", { count: String(x.count), version: String(x.version), by: x.by })}</span>
                </div>
                <a href={`/api/admin/certificate-exports/${x.id}/download`} className="btn-outline btn-sm">
                  {t("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">{t("personalData")}</p>
      </div>
    </section>
  );
}
