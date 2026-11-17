"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { CheckField, TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

export type CourseValues = {
  slug: string;
  titleAr: string;
  titleEn: string;
  shortDescAr: string;
  shortDescEn: string;
  descriptionAr: string;
  descriptionEn: string;
  language: string;
  formatAr: string;
  formatEn: string;
  lectureFrequencyAr: string;
  lectureFrequencyEn: string;
  targetAudienceAr: string;
  targetAudienceEn: string;
  prerequisitesAr: string;
  prerequisitesEn: string;
  enrollmentOpen: boolean;
  attendanceEnabled: boolean;
  questionsEnabled: boolean;
  examEnabled: boolean;
  certificateEnabled: boolean;
  recordingsEnabled: boolean;
};

export const NEW_COURSE_VALUES: CourseValues = {
  slug: "", titleAr: "", titleEn: "", shortDescAr: "", shortDescEn: "", descriptionAr: "", descriptionEn: "",
  language: "ar", formatAr: "", formatEn: "", lectureFrequencyAr: "", lectureFrequencyEn: "",
  targetAudienceAr: "", targetAudienceEn: "", prerequisitesAr: "", prerequisitesEn: "",
  enrollmentOpen: true, attendanceEnabled: true, questionsEnabled: true, examEnabled: false,
  certificateEnabled: false, recordingsEnabled: true,
};

const REQUIRED = new Set(["slug", "titleAr", "language"]);

/** Create: every filled-in field. Edit: only what changed (and never the locked slug). */
function buildBody(v: CourseValues, base: CourseValues | null, slugLocked: boolean) {
  const body: Record<string, string | boolean> = {};
  for (const key of Object.keys(v) as (keyof CourseValues)[]) {
    if (key === "slug" && slugLocked) continue;
    const value = v[key];
    if (base) {
      if (value !== base[key]) body[key] = value;
    } else if (typeof value === "boolean") {
      body[key] = value;
    } else if (value.trim() !== "" || REQUIRED.has(key)) {
      body[key] = value.trim();
    }
  }
  return body;
}

export function CourseForm({
  mode,
  courseId,
  initial,
  slugLocked = false,
}: {
  mode: "create" | "edit";
  courseId?: string;
  initial?: CourseValues;
  slugLocked?: boolean;
}) {
  const t = useTranslations("admin.course");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const base = initial ?? null;
  const [v, setV] = useState<CourseValues>(initial ?? NEW_COURSE_VALUES);
  const { busy, error, saved, run } = useSave();

  const set = <K extends keyof CourseValues>(key: K, value: CourseValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = buildBody(v, base, slugLocked);
    if (mode === "create") {
      await run(
        () => apiRequest<{ id: string }>("POST", "/api/admin/courses", body),
        (d) => router.push(`/admin/courses/${d.id}`),
      );
    } else if (Object.keys(body).length > 0) {
      await run(
        () => apiRequest("PATCH", `/api/admin/courses/${courseId}`, body),
        () => router.refresh(),
      );
    }
  }

  const text = (key: keyof CourseValues, label: string, extra: { hint?: string; dir?: "ltr" | "auto"; disabled?: boolean } = {}) => (
    <TextField
      id={`c-${key}`}
      label={label}
      hint={extra.hint}
      dir={extra.dir ?? "auto"}
      disabled={extra.disabled}
      value={v[key] as string}
      onChange={(e) => set(key, e.target.value as CourseValues[typeof key])}
    />
  );
  const area = (key: keyof CourseValues, label: string, rows = 4, hint?: string) => (
    <TextAreaField
      id={`c-${key}`}
      label={label}
      hint={hint}
      rows={rows}
      value={v[key] as string}
      onChange={(e) => set(key, e.target.value as CourseValues[typeof key])}
    />
  );
  const check = (key: keyof CourseValues, label: string) => (
    <CheckField
      id={`c-${key}`}
      label={label}
      checked={v[key] as boolean}
      onChange={(e) => set(key, e.target.checked as CourseValues[typeof key])}
    />
  );

  return (
    <form onSubmit={onSubmit} className="stack gap-6" noValidate>
      <section className="card stack gap-4">
        <h2 className="title-card">{t("basics")}</h2>
        {text("slug", t("slug"), { hint: slugLocked ? t("slugLocked") : t("slugHint"), dir: "ltr", disabled: slugLocked })}
        <div className="form-grid">
          {text("titleAr", t("titleAr"))}
          {text("titleEn", t("titleEn"))}
        </div>
        {text("language", t("language"), { hint: t("languageHint"), dir: "ltr" })}
      </section>

      <section className="card stack gap-4">
        <h2 className="title-card">{t("descriptions")}</h2>
        <div className="form-grid">
          {area("shortDescAr", t("shortAr"), 3)}
          {area("shortDescEn", t("shortEn"), 3)}
          {area("descriptionAr", t("descAr"), 8)}
          {area("descriptionEn", t("descEn"), 8)}
        </div>
      </section>

      <section className="card stack gap-4">
        <h2 className="title-card">{t("delivery")}</h2>
        <div className="form-grid">
          {text("formatAr", t("formatAr"))}
          {text("formatEn", t("formatEn"))}
          {text("lectureFrequencyAr", t("frequencyAr"))}
          {text("lectureFrequencyEn", t("frequencyEn"))}
        </div>
      </section>

      <section className="card stack gap-4">
        <h2 className="title-card">{t("audienceSection")}</h2>
        <div className="form-grid">
          {area("targetAudienceAr", t("audienceAr"), 3)}
          {area("targetAudienceEn", t("audienceEn"), 3)}
          {area("prerequisitesAr", t("prereqAr"), 3, t("prereqHint"))}
          {area("prerequisitesEn", t("prereqEn"), 3)}
        </div>
      </section>

      <section className="card stack gap-4">
        <h2 className="title-card">{t("features")}</h2>
        <div className="form-grid">
          {check("enrollmentOpen", t("enrollmentOpen"))}
          {check("attendanceEnabled", t("attendanceEnabled"))}
          {check("questionsEnabled", t("questionsEnabled"))}
          {check("examEnabled", t("examEnabled"))}
          {check("certificateEnabled", t("certificateEnabled"))}
          {check("recordingsEnabled", t("recordingsEnabled"))}
        </div>
      </section>

      <div className="stack gap-3">
        <ErrorNote error={error} />
        <SavedNote saved={saved && mode === "edit"} />
        <div>
          <button type="submit" className="btn-primary btn-lg" disabled={busy}>
            {mode === "create" ? (busy ? tc("creating") : t("create")) : busy ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </form>
  );
}

