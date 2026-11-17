"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

type Thresholds = {
  minAttendancePercent: number | null;
  minQuestionScorePercent: number | null;
  minExamPercent: number | null;
};

/** Each requirement is on (with a percentage) or off (null). Publishing creates a new version. */
export function CertificateRequirementsForm({
  courseId,
  version,
  initial,
  canConfigure,
  examEnabled,
  questionsEnabled,
  attendanceEnabled,
}: {
  courseId: string;
  version: number | null;
  initial: Thresholds;
  canConfigure: boolean;
  examEnabled: boolean;
  questionsEnabled: boolean;
  attendanceEnabled: boolean;
}) {
  const t = useTranslations("admin.certificates");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [published, setPublished] = useState<number | null>(null);

  const [vals, setVals] = useState({
    att: initial.minAttendancePercent == null ? "" : String(initial.minAttendancePercent),
    q: initial.minQuestionScorePercent == null ? "" : String(initial.minQuestionScorePercent),
    ex: initial.minExamPercent == null ? "" : String(initial.minExamPercent),
  });
  const [on, setOn] = useState({
    att: initial.minAttendancePercent != null,
    q: initial.minQuestionScorePercent != null,
    ex: initial.minExamPercent != null,
  });

  const toNum = (enabled: boolean, v: string) => (enabled && v.trim() !== "" ? Number(v) : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(
      () =>
        apiRequest<{ version: number }>("PUT", `/api/courses/${courseId}/certificate-requirements`, {
          minAttendancePercent: toNum(on.att, vals.att),
          minQuestionScorePercent: toNum(on.q, vals.q),
          minExamPercent: toNum(on.ex, vals.ex),
        }),
      (d) => {
        setPublished(d.version);
        router.refresh();
      },
    );
  }

  const row = (key: "att" | "q" | "ex", label: string, available: boolean) => (
    <div className="flex flex-wrap items-end gap-4" key={key}>
      <label className="flex items-center gap-2 pb-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          className="checkbox"
          checked={on[key]}
          disabled={!canConfigure || !available}
          onChange={(e) => setOn((p) => ({ ...p, [key]: e.target.checked }))}
        />
        {t("enable")}
      </label>
      <div className="min-w-56 flex-1">
        <TextField
          id={`req-${key}`}
          label={label}
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="1"
          dir="ltr"
          disabled={!canConfigure || !on[key] || !available}
          value={vals[key]}
          onChange={(e) => setVals((p) => ({ ...p, [key]: e.target.value }))}
        />
      </div>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="card stack gap-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="title-card">{t("reqTitle")}</h2>
        <span className="text-sm text-muted">{version ? t("version", { version: String(version) }) : t("noVersion")}</span>
      </div>
      <p className="text-sm text-muted">{t("reqIntro")}</p>
      {row("att", t("minAttendance"), attendanceEnabled)}
      {row("q", t("minQuestions"), questionsEnabled)}
      {row("ex", t("minExam"), examEnabled)}
      <ErrorNote error={error} />
      {published != null ? (
        <p role="status" className="text-sm text-success">
          {t("published", { version: String(published) })}
        </p>
      ) : null}
      {canConfigure ? (
        <div>
          <button type="submit" className="btn-primary" disabled={busy}>
            {t("publish")}
          </button>
        </div>
      ) : null}
    </form>
  );
}
