"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { CheckField, SelectField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

export type SettingsValues = {
  partialWeight: string;
  allowLateSubmissions: boolean;
  defaultPenaltyType: "NONE" | "PERCENT" | "POINTS";
  defaultPenaltyValue: string;
  answerRevealMode: "AFTER_GRADE_AND_DEADLINE" | "AFTER_GRADE" | "NEVER";
  recordingsVisibility: "PUBLIC" | "SIGNED_IN" | "ENROLLED";
  materialsVisibility: "PUBLIC" | "SIGNED_IN" | "ENROLLED";
};

export function CourseSettingsForm({ courseId, initial }: { courseId: string; initial: SettingsValues }) {
  const t = useTranslations("admin.settings");
  const tv = useTranslations("admin.visibility");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [v, setV] = useState<SettingsValues>(initial);
  const { busy, error, saved, run } = useSave();
  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => setV((p) => ({ ...p, [key]: value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(
      () =>
        apiRequest("PUT", `/api/admin/courses/${courseId}/settings`, {
          partialWeight: Number(v.partialWeight),
          allowLateSubmissions: v.allowLateSubmissions,
          defaultPenaltyType: v.defaultPenaltyType,
          defaultPenaltyValue: Number(v.defaultPenaltyValue || 0),
          answerRevealMode: v.answerRevealMode,
          recordingsVisibility: v.recordingsVisibility,
          materialsVisibility: v.materialsVisibility,
        }),
      () => router.refresh(),
    );
  }

  const visibilityOptions = (["PUBLIC", "SIGNED_IN", "ENROLLED"] as const).map((k) => (
    <option key={k} value={k}>
      {tv(k)}
    </option>
  ));

  return (
    <form onSubmit={onSubmit} className="card stack gap-4" noValidate>
      <h2 className="title-card">{t("title")}</h2>
      <div className="form-grid">
        <TextField
          id="s-partial"
          label={t("partialWeight")}
          hint={t("partialWeightHint")}
          type="number"
          inputMode="decimal"
          step="0.05"
          min="0"
          max="1"
          dir="ltr"
          value={v.partialWeight}
          onChange={(e) => set("partialWeight", e.target.value)}
        />
        <SelectField
          id="s-reveal"
          label={t("revealMode")}
          value={v.answerRevealMode}
          onChange={(e) => set("answerRevealMode", e.target.value as SettingsValues["answerRevealMode"])}
        >
          {(["AFTER_GRADE_AND_DEADLINE", "AFTER_GRADE", "NEVER"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`revealModes.${k}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="s-penalty-type"
          label={t("penaltyType")}
          value={v.defaultPenaltyType}
          onChange={(e) => set("defaultPenaltyType", e.target.value as SettingsValues["defaultPenaltyType"])}
        >
          {(["NONE", "PERCENT", "POINTS"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`penaltyTypes.${k}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          id="s-penalty-value"
          label={t("penaltyValue")}
          hint={t("penaltyHint")}
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          dir="ltr"
          disabled={v.defaultPenaltyType === "NONE"}
          value={v.defaultPenaltyValue}
          onChange={(e) => set("defaultPenaltyValue", e.target.value)}
        />
        <SelectField
          id="s-rec-vis"
          label={t("recordingsVisibility")}
          value={v.recordingsVisibility}
          onChange={(e) => set("recordingsVisibility", e.target.value as SettingsValues["recordingsVisibility"])}
        >
          {visibilityOptions}
        </SelectField>
        <SelectField
          id="s-mat-vis"
          label={t("materialsVisibility")}
          value={v.materialsVisibility}
          onChange={(e) => set("materialsVisibility", e.target.value as SettingsValues["materialsVisibility"])}
        >
          {visibilityOptions}
        </SelectField>
      </div>
      <CheckField
        id="s-late"
        label={t("allowLate")}
        checked={v.allowLateSubmissions}
        onChange={(e) => set("allowLateSubmissions", e.target.checked)}
      />
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
