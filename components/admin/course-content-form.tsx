"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

export type Objective = { textAr: string; textEn: string };
export type Faq = {
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
};

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Learning objectives and FAQ for the public course page. The order here is the order shown. */
export function CourseContentForm({
  courseId,
  initialObjectives,
  initialFaqs,
}: {
  courseId: string;
  initialObjectives: Objective[];
  initialFaqs: Faq[];
}) {
  const t = useTranslations("admin.content");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [objectives, setObjectives] = useState<Objective[]>(initialObjectives);
  const [faqs, setFaqs] = useState<Faq[]>(initialFaqs);
  const { busy, error, saved, run } = useSave();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(
      () =>
        apiRequest("PUT", `/api/admin/courses/${courseId}/content`, {
          // Half-empty rows are dropped rather than rejected
          objectives: objectives
            .filter((o) => o.textAr.trim())
            .map((o) => ({
              textAr: o.textAr.trim(),
              textEn: o.textEn.trim() || null,
            })),
          faqs: faqs
            .filter((f) => f.questionAr.trim() && f.answerAr.trim())
            .map((f) => ({
              questionAr: f.questionAr.trim(),
              questionEn: f.questionEn.trim() || null,
              answerAr: f.answerAr.trim(),
              answerEn: f.answerEn.trim() || null,
            })),
        }),
      () => router.refresh(),
    );
  }

  const rowTools = (
    index: number,
    length: number,
    onMove: (d: -1 | 1) => void,
    onRemove: () => void,
  ) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label={tc("moveUp")}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => onMove(1)}
        disabled={index === length - 1}
        aria-label={tc("moveDown")}
      >
        ↓
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={onRemove}>
        {tc("remove")}
      </button>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="card stack gap-6" noValidate>
      <h2 className="title-card">{t("title")}</h2>

      <section className="stack gap-3">
        <h3 className="font-semibold text-ink">{t("objectives")}</h3>
        {objectives.map((o, i) => (
          <div
            key={i}
            className="stack gap-2 rounded-control border border-line p-3"
          >
            <div className="form-grid">
              <TextField
                id={`o-ar-${i}`}
                label={t("objectiveAr")}
                value={o.textAr}
                onChange={(e) =>
                  setObjectives((l) =>
                    l.map((x, j) =>
                      j === i ? { ...x, textAr: e.target.value } : x,
                    ),
                  )
                }
              />
              <TextField
                id={`o-en-${i}`}
                label={t("objectiveEn")}
                value={o.textEn}
                onChange={(e) =>
                  setObjectives((l) =>
                    l.map((x, j) =>
                      j === i ? { ...x, textEn: e.target.value } : x,
                    ),
                  )
                }
                className={`ltr`}
              />
            </div>
            {rowTools(
              i,
              objectives.length,
              (d) => setObjectives((l) => move(l, i, d)),
              () => setObjectives((l) => l.filter((_, j) => j !== i)),
            )}
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() =>
              setObjectives((l) => [...l, { textAr: "", textEn: "" }])
            }
          >
            {t("addObjective")}
          </button>
        </div>
      </section>

      <section className="stack gap-3">
        <h3 className="font-semibold text-ink">{t("faqs")}</h3>
        {faqs.map((f, i) => (
          <div
            key={i}
            className="stack gap-2 rounded-control border border-line p-3"
          >
            <div className="form-grid">
              <TextField
                id={`f-qar-${i}`}
                label={t("questionAr")}
                value={f.questionAr}
                onChange={(e) =>
                  setFaqs((l) =>
                    l.map((x, j) =>
                      j === i ? { ...x, questionAr: e.target.value } : x,
                    ),
                  )
                }
              />
              <TextField
                id={`f-qen-${i}`}
                label={t("questionEn")}
                value={f.questionEn}
                onChange={(e) =>
                  setFaqs((l) =>
                    l.map((x, j) =>
                      j === i ? { ...x, questionEn: e.target.value } : x,
                    ),
                  )
                }
              />
              <TextAreaField
                id={`f-aar-${i}`}
                label={t("answerAr")}
                rows={3}
                value={f.answerAr}
                onChange={(e) =>
                  setFaqs((l) =>
                    l.map((x, j) =>
                      j === i ? { ...x, answerAr: e.target.value } : x,
                    ),
                  )
                }
              />
              <TextAreaField
                id={`f-aen-${i}`}
                label={t("answerEn")}
                rows={3}
                value={f.answerEn}
                onChange={(e) =>
                  setFaqs((l) =>
                    l.map((x, j) =>
                      j === i ? { ...x, answerEn: e.target.value } : x,
                    ),
                  )
                }
              />
            </div>
            {rowTools(
              i,
              faqs.length,
              (d) => setFaqs((l) => move(l, i, d)),
              () => setFaqs((l) => l.filter((_, j) => j !== i)),
            )}
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() =>
              setFaqs((l) => [
                ...l,
                { questionAr: "", questionEn: "", answerAr: "", answerEn: "" },
              ])
            }
          >
            {t("addFaq")}
          </button>
        </div>
      </section>

      <ErrorNote error={error} />
      <SavedNote saved={saved} />
      <div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? tc("saving") : tc("save")}
        </button>
      </div>
    </form>
  );
}
