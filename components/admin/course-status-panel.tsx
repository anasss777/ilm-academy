"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

type Action = "publish" | "unpublish" | "archive" | "unarchive";

export function CourseStatusPanel({
  courseId,
  slug,
  status,
  activeEnrollments,
  canPublish,
  canArchive,
}: {
  courseId: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  activeEnrollments: number;
  canPublish: boolean;
  canArchive: boolean;
}) {
  const t = useTranslations("admin.status");
  const td = useTranslations("admin.dashboard");
  const router = useRouter();
  const { busy, error, run } = useSave();

  const go = (action: Action) =>
    run(
      () => apiRequest("POST", `/api/admin/courses/${courseId}/status`, { action }),
      () => router.refresh(),
    );

  const tone = status === "PUBLISHED" ? "badge-success" : status === "ARCHIVED" ? "badge-muted" : "badge-warning";

  return (
    <section className="card stack gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="title-card">{t("title")}</h2>
        <span className={tone}>{td(`status.${status}`)}</span>
      </div>

      {status === "DRAFT" && canPublish ? (
        <div className="stack gap-2">
          <p className="text-sm text-muted">{t("publishHint")}</p>
          <div>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => go("publish")}>
              {t("publish")}
            </button>
          </div>
        </div>
      ) : null}

      {status === "PUBLISHED" ? (
        <div className="stack gap-3">
          <div className="cluster">
            {canPublish ? (
              <button type="button" className="btn-outline" disabled={busy || activeEnrollments > 0} onClick={() => go("unpublish")}>
                {t("unpublish")}
              </button>
            ) : null}
            {canArchive ? (
              <button type="button" className="btn-outline" disabled={busy} onClick={() => go("archive")}>
                {t("archive")}
              </button>
            ) : null}
          </div>
          {activeEnrollments > 0 ? <p className="text-sm text-muted">{t("unpublishBlocked")}</p> : null}
          <p className="text-sm text-muted">{t("archiveHint")}</p>
        </div>
      ) : null}

      {status === "ARCHIVED" && canArchive ? (
        <div>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => go("unarchive")}>
            {t("unarchive")}
          </button>
        </div>
      ) : null}

      <ErrorNote error={error} />

      {status !== "DRAFT" ? (
        <Link href={`/courses/${encodeURIComponent(slug)}`} className="link text-sm">
          {t("viewPublic")}
        </Link>
      ) : null}
    </section>
  );
}
