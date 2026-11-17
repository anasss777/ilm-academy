"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

type Status = "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED";
const STATUSES: Status[] = ["PRESENT", "PARTIAL", "ABSENT", "EXCUSED"];

export type RosterRow = { userId: string; fullName: string; email: string; status: Status | null };

const toMap = (rows: RosterRow[]) => Object.fromEntries(rows.map((r) => [r.userId, r.status])) as Record<string, Status | null>;

/**
 * One tap per student; tapping the active status again clears it ("not recorded").
 * Only students whose status changed are sent when saving.
 */
export function AttendanceSheet({ lectureId, rows, canEdit }: { lectureId: string; rows: RosterRow[]; canEdit: boolean }) {
  const t = useTranslations("admin.attendance");
  const router = useRouter();
  const { busy, error, saved, run } = useSave();
  const [baseline, setBaseline] = useState(() => toMap(rows));
  const [current, setCurrent] = useState(() => toMap(rows));

  const changes = rows
    .filter((r) => (current[r.userId] ?? null) !== (baseline[r.userId] ?? null))
    .map((r) => ({ userId: r.userId, status: current[r.userId] ?? null }));

  const count = (s: Status | null) => rows.filter((r) => (current[r.userId] ?? null) === s).length;

  const setStatus = (userId: string, status: Status) =>
    setCurrent((c) => ({ ...c, [userId]: c[userId] === status ? null : status }));

  async function onSave() {
    if (changes.length === 0) return;
    await run(
      () => apiRequest("PUT", `/api/admin/lectures/${lectureId}/attendance`, { entries: changes }),
      () => {
        setBaseline(current);
        router.refresh();
      },
    );
  }

  return (
    <div className="stack gap-4">
      <div className="toolbar justify-between">
        <p className="text-sm text-muted">
          {t("summary", {
            present: String(count("PRESENT")),
            partial: String(count("PARTIAL")),
            absent: String(count("ABSENT")),
            excused: String(count("EXCUSED")),
            none: String(count(null)),
          })}
        </p>
        {canEdit ? (
          <div className="cluster gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => setCurrent(Object.fromEntries(rows.map((r) => [r.userId, "PRESENT"])) as Record<string, Status | null>)}>
              {t("markAllPresent")}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCurrent(Object.fromEntries(rows.map((r) => [r.userId, null])))}>
              {t("clearAll")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("student")}</th>
              <th>{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>
                  <div className="font-medium text-ink" dir="auto">{r.fullName}</div>
                  <div className="text-xs text-muted" dir="ltr">{r.email}</div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={r.fullName}>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={current[r.userId] === s}
                        disabled={!canEdit || busy}
                        onClick={() => setStatus(r.userId, s)}
                        className={current[r.userId] === s ? "btn-primary btn-sm" : "btn-outline btn-sm"}
                      >
                        {t(`statuses.${s}`)}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="stack gap-2">
          <ErrorNote error={error} />
          <SavedNote saved={saved && changes.length === 0} text={t("saved")} />
          <div className="cluster">
            <button type="button" className="btn-primary" disabled={busy || changes.length === 0} onClick={onSave}>
              {t("save")}
            </button>
            <span className="text-sm text-muted">{changes.length > 0 ? t("changed", { count: String(changes.length) }) : t("noChanges")}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
