"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { CheckField, TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

type Status = "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED";
type Counts = Record<Status, number>;

type Preview = {
  headerLine: number;
  columns: { email: boolean; name: boolean; minutes: boolean; status: boolean };
  rowsRead: number;
  invalid: { line: number; reason: "MINUTES" | "STATUS" }[];
  invalidTotal: number;
  lectureMinutes: number;
  counts: Counts;
  totals: { entries: number; unmatched: number; notInFile: number; skippedManual: number };
  entries: { userId: string; fullName: string; email: string; status: Status; minutes: number | null; matchedBy: "email" | "name" | "missing"; replaces: Status | null }[];
  unmatched: { label: string; minutes: number | null; reason: "NOT_FOUND" | "AMBIGUOUS" }[];
  notInFile: { userId: string; fullName: string; email: string }[];
  skippedManual: { userId: string; fullName: string; existing: Status; proposed: Status }[];
};

const MAX_BYTES = 1_000_000;
const TEMPLATE = `data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFFemail,minutes\nstudent1@example.com,95\nstudent2@example.com,20\n")}`;
const SHOWN = 100;

/**
 * Import attendance from a file (a Zoom participants report works as is).
 * Step 1: preview what would be recorded. Step 2: confirm. Nothing is saved before the second step.
 */
export function AttendanceImport({ lectureId, lectureMinutes }: { lectureId: string; lectureMinutes: number }) {
  const t = useTranslations("admin.attendanceImport");
  const ts = useTranslations("admin.attendance");
  const router = useRouter();
  const previewSave = useSave();
  const applySave = useSave();

  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState(false);
  const [present, setPresent] = useState("75");
  const [partial, setPartial] = useState("25");
  const [absentMissing, setAbsentMissing] = useState(false);
  const [overwriteManual, setOverwriteManual] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [done, setDone] = useState<number | null>(null);

  const optionsKey = JSON.stringify([fileName, csv?.length, present, partial, absentMissing, overwriteManual]);
  const stale = preview != null && previewKey !== optionsKey;

  const body = (dryRun: boolean) => ({
    csv,
    dryRun,
    presentPercent: Number(present),
    partialPercent: Number(partial),
    absentMissing,
    overwriteManual,
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPreview(null);
    setDone(null);
    setFileError(false);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setCsv(null);
      setFileName(file.name);
      setFileError(true);
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
  }

  async function onPreview() {
    setDone(null);
    await previewSave.run(
      () => apiRequest<Preview>("POST", `/api/admin/lectures/${lectureId}/attendance/import`, body(true)),
      (data) => {
        setPreview(data);
        setPreviewKey(optionsKey);
      },
    );
  }

  async function onApply() {
    await applySave.run(
      () => apiRequest<{ written: number }>("POST", `/api/admin/lectures/${lectureId}/attendance/import`, body(false)),
      (data) => {
        setDone(data.written);
        setPreview(null);
        router.refresh();
      },
    );
  }

  const statusBadge = (s: Status) =>
    s === "PRESENT" ? "badge-success" : s === "PARTIAL" ? "badge-warning" : s === "EXCUSED" ? "badge-info" : "badge-danger";

  return (
    <div className="stack gap-5">
      <p className="text-sm text-muted">{t("intro")}</p>

      <div className="form-grid">
        <div>
          <label htmlFor="att-file" className="label">{t("fileLabel")}</label>
          <input id="att-file" type="file" accept=".csv,.txt,text/csv,text/plain" className="input" onChange={onFile} />
          <p className="field-hint">{t("fileHint")}</p>
          {fileName ? <p className="mt-1 text-sm text-ink" dir="auto">{fileName}</p> : null}
          {fileError ? <p role="alert" className="field-error">{t("tooLarge")}</p> : null}
          <a href={TEMPLATE} download="attendance-template.csv" className="link text-sm">
            {t("template")}
          </a>
        </div>
        <div className="stack gap-3">
          <p className="text-sm text-muted">{t("lectureLength", { minutes: String(lectureMinutes) })}</p>
          <TextField id="att-present" label={t("presentAt")} type="number" inputMode="numeric" min="1" max="100" dir="ltr" value={present} onChange={(e) => setPresent(e.target.value)} />
          <TextField id="att-partial" label={t("partialAt")} hint={t("belowAbsent")} type="number" inputMode="numeric" min="1" max="99" dir="ltr" value={partial} onChange={(e) => setPartial(e.target.value)} />
        </div>
      </div>

      <div className="stack gap-3">
        <CheckField id="att-missing" label={t("absentMissing")} hint={t("absentMissingHint")} checked={absentMissing} onChange={(e) => setAbsentMissing(e.target.checked)} />
        <CheckField id="att-overwrite" label={t("overwriteManual")} hint={t("overwriteHint")} checked={overwriteManual} onChange={(e) => setOverwriteManual(e.target.checked)} />
      </div>

      <ErrorNote error={previewSave.error} />
      <div>
        <button type="button" className="btn-outline" disabled={!csv || previewSave.busy} onClick={onPreview}>
          {previewSave.busy ? t("previewing") : t("preview")}
        </button>
      </div>

      {done != null ? (
        <p role="status" className="alert-success">
          {t("done", { count: String(done) })}
        </p>
      ) : null}

      {preview ? (
        <section className="stack gap-4 border-t border-line pt-5" aria-live="polite">
          <h3 className="title-card">{t("summary")}</h3>

          <p className="text-sm text-muted">
            {t("rowsRead", { count: String(preview.rowsRead) })} ·{" "}
            {[
              preview.columns.email && t("colEmail"),
              preview.columns.name && t("colName"),
              preview.columns.minutes && t("colMinutes"),
              preview.columns.status && t("colStatus"),
            ]
              .filter(Boolean)
              .join(" / ")}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["PRESENT", "PARTIAL", "ABSENT", "EXCUSED"] as const).map((s) => (
              <div key={s} className="stat">
                <span className="stat-value">{preview.counts[s]}</span>
                <span className="stat-label">{ts(`statuses.${s}`)}</span>
              </div>
            ))}
          </div>

          {preview.invalidTotal > 0 ? (
            <p className="alert-warning">
              {t("invalidRows", { count: String(preview.invalidTotal) })}{" "}
              <span dir="ltr">({preview.invalid.map((i) => `#${i.line}`).join(", ")}{preview.invalidTotal > preview.invalid.length ? ", …" : ""})</span>
            </p>
          ) : null}

          {preview.totals.skippedManual > 0 ? (
            <div className="stack gap-1">
              <p className="alert-info">{t("skippedManual", { count: String(preview.totals.skippedManual) })}</p>
            </div>
          ) : null}

          {preview.entries.length === 0 ? (
            <p className="alert-warning">{t("noRows")}</p>
          ) : (
            <div className="stack gap-2">
              <div className="table-wrap max-h-96 overflow-y-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("student")}</th>
                      <th>{t("minutes")}</th>
                      <th>{ts("status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.entries.slice(0, SHOWN).map((e) => (
                      <tr key={e.userId}>
                        <td>
                          <div className="font-medium text-ink" dir="auto">{e.fullName}</div>
                          <div className="text-xs text-muted" dir="ltr">{e.email}</div>
                          {e.matchedBy === "name" ? <span className="badge-warning mt-1">{t("matchedByName")}</span> : null}
                          {e.matchedBy === "missing" ? <span className="badge-muted mt-1">{t("notInFileBadge")}</span> : null}
                        </td>
                        <td>{e.minutes == null ? "—" : Math.round(e.minutes)}</td>
                        <td>
                          <div className="cluster gap-2">
                            <span className={statusBadge(e.status)}>{ts(`statuses.${e.status}`)}</span>
                            {e.replaces && e.replaces !== e.status ? (
                              <span className="text-xs text-muted">{t("replaces", { status: ts(`statuses.${e.replaces}`) })}</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.entries.length > SHOWN ? <p className="text-xs text-muted">{t("showingFirst", { count: String(SHOWN), total: String(preview.totals.entries) })}</p> : null}
            </div>
          )}

          {preview.totals.unmatched > 0 ? (
            <details className="panel">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {t("unmatched", { count: String(preview.totals.unmatched) })}
              </summary>
              <p className="mt-2 text-sm text-muted">{t("unmatchedHint")}</p>
              <ul className="mt-2 stack gap-1 text-sm">
                {preview.unmatched.slice(0, SHOWN).map((u) => (
                  <li key={u.label} className="flex flex-wrap items-center gap-2">
                    <span dir="auto">{u.label}</span>
                    {u.minutes != null ? <span className="text-xs text-muted">{Math.round(u.minutes)} {t("minutesShort")}</span> : null}
                    <span className="badge-muted">{u.reason === "AMBIGUOUS" ? t("ambiguous") : t("notFound")}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {preview.totals.notInFile > 0 && !absentMissing ? (
            <details className="panel">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {t("notInFile", { count: String(preview.totals.notInFile) })}
              </summary>
              <ul className="mt-2 stack gap-1 text-sm">
                {preview.notInFile.slice(0, SHOWN).map((s) => (
                  <li key={s.userId} dir="auto">{s.fullName}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {stale ? <p className="alert-warning">{t("stale")}</p> : null}
          <ErrorNote error={applySave.error} />
          <div>
            <button type="button" className="btn-primary" disabled={stale || applySave.busy || preview.entries.length === 0} onClick={onApply}>
              {applySave.busy ? t("applying") : t("apply", { count: String(preview.totals.entries) })}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
