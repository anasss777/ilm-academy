"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { fromLocalInput, toLocalInput } from "@/lib/ui/datetime";
import { SelectField, TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

type QType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";
type PublishStatus = "DRAFT" | "PUBLISHED";

export type QuestionParent = { kind: "lecture"; lectureId: string } | { kind: "exam"; examId: string };

export type QuestionInitial = {
  id: string;
  type: QType;
  body: string;
  points: number;
  explanation: string;
  status: PublishStatus;
  options: { text: string; isCorrect: boolean }[];
  dueAt: string | null;
  lateCutoffAt: string | null;
  allowLate: boolean | null;
  answerCount: number;
  /** Students have answered: options, correct answer and points can no longer change */
  locked: boolean;
};

/** Create or edit one question, for a lecture or for the exam (same form, same rules). */
export function QuestionForm({
  mode,
  courseId,
  parent,
  initial,
  backHref,
}: {
  mode: "create" | "edit";
  courseId: string;
  parent: QuestionParent;
  initial?: QuestionInitial;
  backHref: string;
}) {
  const t = useTranslations("admin.questions.form");
  const tt = useTranslations("admin.questions.types");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, saved, run, fail } = useSave();
  const locked = mode === "edit" && !!initial?.locked;

  const [type, setType] = useState<QType>(initial?.type ?? "MULTIPLE_CHOICE");
  const [body, setBody] = useState(initial?.body ?? "");
  const [points, setPoints] = useState(initial ? String(initial.points) : "1");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [status, setStatus] = useState<PublishStatus>(initial?.status ?? "DRAFT");
  const [options, setOptions] = useState<string[]>(() =>
    initial?.type === "MULTIPLE_CHOICE" && initial.options.length > 0 ? initial.options.map((o) => o.text) : ["", ""],
  );
  const [correctIndex, setCorrectIndex] = useState(() => {
    const i = initial?.type === "MULTIPLE_CHOICE" ? initial.options.findIndex((o) => o.isCorrect) : 0;
    return i >= 0 ? i : 0;
  });
  const [tf, setTf] = useState<"true" | "false">(
    initial?.type === "TRUE_FALSE" && initial.options[0] && !initial.options[0].isCorrect ? "false" : "true",
  );
  const [dueAt, setDueAt] = useState(() => toLocalInput(initial?.dueAt));
  const [lateCutoff, setLateCutoff] = useState(() => toLocalInput(initial?.lateCutoffAt));
  const [allowLate, setAllowLate] = useState<"inherit" | "yes" | "no">(
    initial?.allowLate == null ? "inherit" : initial.allowLate ? "yes" : "no",
  );
  const [confirming, setConfirming] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pts = Number(points);
    if (!body.trim() || !Number.isFinite(pts) || pts <= 0) {
      fail({ code: "INVALID_QUESTION" });
      return;
    }

    const payload: Record<string, unknown> = {
      body: body.trim(),
      explanation: explanation.trim() || null,
      status,
    };

    if (!locked) {
      payload.points = pts;
      if (type === "MULTIPLE_CHOICE") {
        const filled = options
          .map((text, i) => ({ text: text.trim(), isCorrect: i === correctIndex }))
          .filter((o) => o.text);
        // At least two options, and the correct one must still be there
        if (filled.length < 2 || !filled.some((o) => o.isCorrect)) {
          fail({ code: "INVALID_QUESTION" });
          return;
        }
        payload.options = filled;
      }
      if (type === "TRUE_FALSE") payload.correctAnswer = tf === "true";
    }

    if (parent.kind === "lecture") {
      payload.dueAt = fromLocalInput(dueAt);
      payload.lateCutoffAt = fromLocalInput(lateCutoff);
      payload.allowLate = allowLate === "inherit" ? null : allowLate === "yes";
    }

    if (mode === "create") {
      const url =
        parent.kind === "lecture"
          ? `/api/admin/lectures/${parent.lectureId}/questions`
          : `/api/admin/exams/${parent.examId}/questions`;
      await run(
        () => apiRequest<{ id: string }>("POST", url, { type, ...payload }),
        (d) => router.push(`/admin/courses/${courseId}/questions/${d.id}`),
      );
    } else {
      await run(
        () => apiRequest("PATCH", `/api/admin/questions/${initial!.id}`, payload),
        () => router.refresh(),
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-6" noValidate>
      {locked ? <p className="alert-info">{t("lockedNote")}</p> : null}
      {parent.kind === "exam" ? <p className="alert-info">{t("examNote")}</p> : null}

      <section className="card stack gap-4">
        <div className="form-grid">
          <SelectField id="q-type" label={t("type")} value={type} disabled={mode === "edit"} onChange={(e) => setType(e.target.value as QType)}>
            {(["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN"] as const).map((k) => (
              <option key={k} value={k}>
                {tt(k)}
              </option>
            ))}
          </SelectField>
          <TextField
            id="q-points"
            label={t("points")}
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            dir="ltr"
            disabled={locked}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <TextAreaField id="q-body" label={t("body")} rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />
        <TextAreaField
          id="q-expl"
          label={t("explanation")}
          hint={t("explanationHint")}
          rows={3}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />
        <SelectField id="q-status" label={t("status")} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
          <option value="DRAFT">{t("draft")}</option>
          <option value="PUBLISHED">{t("published")}</option>
        </SelectField>
      </section>

      {type === "MULTIPLE_CHOICE" ? (
        <section className="card stack gap-3">
          <h2 className="title-card">{t("options")}</h2>
          <div className="stack gap-3" role="radiogroup" aria-label={t("correct")}>
            {options.map((text, i) => (
              <div key={i} className="flex items-end gap-3">
                <label className="flex shrink-0 flex-col items-center gap-1 pb-2 text-xs text-muted">
                  <input
                    type="radio"
                    name="correct"
                    className="radio"
                    checked={correctIndex === i}
                    disabled={locked}
                    onChange={() => setCorrectIndex(i)}
                    aria-label={t("correct")}
                  />
                </label>
                <div className="flex-1">
                  <TextField
                    id={`q-opt-${i}`}
                    label={t("optionText", { number: String(i + 1) })}
                    dir="auto"
                    disabled={locked}
                    value={text}
                    onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </div>
                {!locked && options.length > 2 ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm mb-1"
                    onClick={() => {
                      setOptions((l) => l.filter((_, j) => j !== i));
                      setCorrectIndex((c) => (c === i ? 0 : c > i ? c - 1 : c));
                    }}
                  >
                    {t("removeOption")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {!locked && options.length < 10 ? (
            <div>
              <button type="button" className="btn-outline btn-sm" onClick={() => setOptions((l) => [...l, ""])}>
                {t("addOption")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {type === "TRUE_FALSE" ? (
        <section className="card stack gap-3">
          <h2 className="title-card">{t("tfCorrect")}</h2>
          <div className="stack gap-2" role="radiogroup" aria-label={t("tfCorrect")}>
            {(["true", "false"] as const).map((v) => (
              <label key={v} className={tf === v ? "option option-selected cursor-pointer" : "option cursor-pointer"}>
                <input type="radio" name="tf" className="radio mt-0.5" checked={tf === v} disabled={locked} onChange={() => setTf(v)} />
                <span>{t(v)}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {parent.kind === "lecture" ? (
        <section className="card stack gap-4">
          <div className="form-grid">
            <TextField
              id="q-due"
              label={t("dueAt")}
              hint={t("dueHint")}
              type="datetime-local"
              dir="ltr"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              suppressHydrationWarning
            />
            <SelectField id="q-late" label={t("allowLate")} value={allowLate} onChange={(e) => setAllowLate(e.target.value as "inherit" | "yes" | "no")}>
              <option value="inherit">{t("inherit")}</option>
              <option value="yes">{t("yes")}</option>
              <option value="no">{t("no")}</option>
            </SelectField>
            <TextField
              id="q-cutoff"
              label={t("lateCutoff")}
              type="datetime-local"
              dir="ltr"
              disabled={allowLate === "no"}
              value={lateCutoff}
              onChange={(e) => setLateCutoff(e.target.value)}
              suppressHydrationWarning
            />
          </div>
        </section>
      ) : null}

      <div className="stack gap-3">
        <ErrorNote error={error} />
        <SavedNote saved={saved && mode === "edit"} />
        <div className="cluster">
          <button type="submit" className="btn-primary" disabled={busy}>
            {mode === "create" ? (busy ? tc("creating") : t("create")) : busy ? tc("saving") : tc("save")}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.push(backHref)} disabled={busy}>
            {t("back")}
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <section className="card stack gap-3">
          {confirming ? (
            <>
              <p className="text-sm font-medium text-ink">{t("deleteConfirm")}</p>
              <div className="cluster">
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => apiRequest("DELETE", `/api/admin/questions/${initial!.id}`),
                      () => router.push(backHref),
                    )
                  }
                >
                  {tc("confirmDelete")}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                  {tc("cancel")}
                </button>
              </div>
            </>
          ) : (
            <div>
              <button type="button" className="btn-outline" onClick={() => setConfirming(true)}>
                {t("deleteButton")}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </form>
  );
}
