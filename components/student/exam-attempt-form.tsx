"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { apiErrorKey } from "@/lib/ui/errors";
import {
  countUnanswered,
  draftChanges,
  normalizeAnswer,
  type Draft,
  type DraftAnswer,
} from "@/lib/ui/exam-draft";

export type ExamQuestionView = {
  id: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";
  body: string;
  pointsText: string;
  options: { id: string; text: string }[];
};

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

/**
 * The exam answer sheet.
 *  - Every change is saved automatically a moment after the student stops typing, sending only
 *    what changed. A failed save is retried every few seconds.
 *  - Submitting first saves anything still pending, then submits; the server grades the
 *    objective questions at once.
 *  - Leaving the page with unsaved changes asks for confirmation.
 */
export function ExamAttemptForm({
  attemptId,
  questions,
  initialDraft,
  dueText,
  expired,
  endsAtIso,
  serverNowIso,
  timeLimitMinutes,
}: {
  attemptId: string;
  questions: ExamQuestionView[];
  initialDraft: Draft;
  dueText: string | null;
  expired: boolean;
  /** When this attempt must end (its own time limit or the exam's closing time), or null */
  endsAtIso: string | null;
  /** The server's clock at render time, so the countdown does not depend on the device clock */
  serverNowIso: string;
  timeLimitMinutes: number | null;
}) {
  const t = useTranslations("exam");
  const tq = useTranslations("question");
  const te = useTranslations("apiErrors");
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(initialDraft);
  const draftRef = useRef<Draft>(initialDraft);
  const savedRef = useRef<Draft>(initialDraft);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const disabled = expired || submitting;

  // ---- Countdown -----------------------------------------------------------------------
  const endMs = endsAtIso ? new Date(endsAtIso).getTime() : null;
  const offsetRef = useRef<number | null>(null); // server clock minus this device's clock
  const [remaining, setRemaining] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [timeUp, setTimeUp] = useState(false);
  const autoSubmitted = useRef(false);
  const retries = useRef(0);
  const submitRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current; // never run two saves at once
    const snapshot = draftRef.current;
    const changes = draftChanges(savedRef.current, snapshot);
    if (changes.length === 0) {
      setStatus("saved");
      return true;
    }
    setStatus("saving");
    const run = (async () => {
      const res = await apiRequest("PUT", `/api/exam-attempts/${attemptId}/answers`, { answers: changes });
      if (!res.ok) {
        setErrorCode(res.code);
        setStatus("error");
        return false;
      }
      savedRef.current = snapshot;
      setErrorCode(null);
      // The student may have kept typing while the request was running
      setStatus(draftChanges(savedRef.current, draftRef.current).length === 0 ? "saved" : "unsaved");
      return true;
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  }, [attemptId]);

  // Debounced autosave after every change (not on the first render)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (expired) return;
    setStatus("unsaved");
    const id = setTimeout(() => void flush(), 1200);
    return () => clearTimeout(id);
  }, [draft, expired, flush]);

  // Retry a failed save
  useEffect(() => {
    if (status !== "error" || expired) return;
    const id = setTimeout(() => void flush(), 5000);
    return () => clearTimeout(id);
  }, [status, expired, flush]);

  // Warn before leaving with unsaved work
  useEffect(() => {
    if (status === "saved") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // Tick from the absolute end time (not by subtracting), so a throttled background tab stays right
  useEffect(() => {
    if (endMs == null) return;
    if (offsetRef.current == null) offsetRef.current = new Date(serverNowIso).getTime() - Date.now();
    const tick = () => {
      const left = Math.max(0, Math.ceil((endMs - (Date.now() + (offsetRef.current ?? 0))) / 1000));
      setRemaining(left);
      if (left === 600 || left === 300 || left === 60) setAnnouncement(t("announceMinutes", { minutes: String(left / 60) }));
      else if (left === 30) setAnnouncement(t("announceSeconds", { seconds: "30" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endMs, serverNowIso, t]);

  // When the time is up, submit what is saved (the server accepts it for a few seconds more)
  useEffect(() => {
    if (endMs == null || autoSubmitted.current || submitting) return;
    if (!(expired || remaining === 0)) return;
    autoSubmitted.current = true;
    setTimeUp(true);
    void submitRef.current();
  }, [expired, remaining, endMs, submitting]);

  // A failed automatic submit is retried a few times; otherwise reload so the server can finish it
  useEffect(() => {
    if (!timeUp || submitting || !errorCode) return;
    if (errorCode === "EXAM_CLOSED" || retries.current >= 4) {
      router.refresh();
      return;
    }
    const id = setTimeout(() => {
      retries.current += 1;
      void submitRef.current();
    }, 3000);
    return () => clearTimeout(id);
  }, [timeUp, submitting, errorCode, router]);

  function setAnswer(questionId: string, patch: Partial<DraftAnswer>) {
    setDraft((d) => ({ ...d, [questionId]: normalizeAnswer({ ...d[questionId], ...patch }) }));
  }

  async function onSubmit() {
    setSubmitting(true);
    setErrorCode(null);
    const saved = await flush();
    if (!saved) {
      setSubmitting(false);
      setConfirming(false);
      return;
    }
    const res = await apiRequest("POST", `/api/exam-attempts/${attemptId}/submit`);
    if (!res.ok) {
      setErrorCode(res.code);
      setSubmitting(false);
      setConfirming(false);
      return;
    }
    router.refresh(); // the page now shows "submitted" or the result
  }

  useEffect(() => {
    submitRef.current = onSubmit; // always the latest version, for the effects above
  });

  const clock = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const unanswered = countUnanswered(
    questions.map((q) => q.id),
    draft,
  );
  const statusText =
    status === "saving" ? t("saving") : status === "saved" ? t("saved") : status === "error" ? t("saveFailed") : t("unsaved");

  return (
    <div className="stack gap-5">
      {endMs != null ? (
        <div
          className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-card"
          role="timer"
          aria-label={t("timeLeft")}
        >
          <div className="stack gap-0.5">
            <span className="text-sm text-muted">{t("timeLeft")}</span>
            {timeLimitMinutes ? <span className="text-xs text-muted">{t("attemptLength", { minutes: String(timeLimitMinutes) })}</span> : null}
          </div>
          <span
            dir="ltr"
            className={`text-2xl font-bold tabular-nums ${remaining != null && remaining <= 60 ? "timer-danger" : remaining != null && remaining <= 300 ? "timer-warn" : "text-ink"}`}
          >
            {remaining == null ? "--:--" : clock(remaining)}
          </span>
        </div>
      ) : null}
      <p className="sr-only" aria-live="assertive">{announcement}</p>
      {timeUp ? <p className="alert-warning">{t("timeUp")}</p> : null}

      <div className="panel stack gap-2">
        <p className="text-sm">{t("intro")}</p>
        {dueText ? <p className="text-sm font-semibold text-ink">{t("due", { date: dueText })}</p> : null}
        <p className={status === "error" ? "text-sm text-danger" : "text-sm text-muted"} aria-live="polite">
          {statusText}
        </p>
      </div>

      {expired ? <p className="alert-warning">{t("expired")}</p> : null}
      {errorCode ? (
        <p role="alert" className="alert-error">
          {te(apiErrorKey(errorCode))}
        </p>
      ) : null}

      {questions.map((q, i) => {
        const answer = normalizeAnswer(draft[q.id]);
        return (
          <section key={q.id} className="card stack gap-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="title-card">{t("question", { number: String(i + 1) })}</h2>
              <span className="badge-muted">{tq("points", { points: q.pointsText })}</span>
            </div>
            <p className="prose-block" dir="auto">{q.body}</p>

            {q.type === "OPEN" ? (
              <textarea
                className="textarea"
                rows={9}
                dir="auto"
                value={answer.answerText ?? ""}
                onChange={(e) => setAnswer(q.id, { answerText: e.target.value, selectedOptionId: null })}
                placeholder={tq("placeholder")}
                aria-label={t("question", { number: String(i + 1) })}
                disabled={disabled}
              />
            ) : (
              <div className="stack gap-2" role="radiogroup">
                {q.options.map((o) => (
                  <label
                    key={o.id}
                    className={answer.selectedOptionId === o.id ? "option option-selected cursor-pointer" : "option cursor-pointer"}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      className="radio mt-0.5"
                      value={o.id}
                      checked={answer.selectedOptionId === o.id}
                      onChange={() => setAnswer(q.id, { selectedOptionId: o.id, answerText: null })}
                      disabled={disabled}
                    />
                    <span dir="auto">{o.text}</span>
                  </label>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {!expired ? (
        <section className="card stack gap-3">
          {confirming ? (
            <>
              <h2 className="title-card">{t("confirmTitle")}</h2>
              <p className="text-sm text-muted">{t("confirmBody")}</p>
              {unanswered > 0 ? <p className="alert-warning">{t("unanswered", { count: String(unanswered) })}</p> : null}
              <div className="cluster">
                <button type="button" className="btn-primary" onClick={onSubmit} disabled={submitting}>
                  {submitting ? t("submitting") : t("confirmYes")}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={submitting}>
                  {t("back")}
                </button>
              </div>
            </>
          ) : (
            <div>
              <button type="button" className="btn-primary btn-lg" onClick={() => setConfirming(true)}>
                {t("submit")}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
