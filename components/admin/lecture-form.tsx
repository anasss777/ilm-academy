"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { fromLocalInput, toLocalInput } from "@/lib/ui/datetime";
import { SelectField, TextAreaField, TextField } from "./fields";
import { ErrorNote, SavedNote } from "./save-status";
import { useSave } from "./use-save";

export type LectureInitial = {
  number: number | null;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  startsAt: string; // ISO instant
  endsAt: string;
  timezone: string;
  zoomUrl: string;
  zoomMeetingId: string;
  zoomPassword: string;
  status: "DRAFT" | "PUBLISHED";
};

export function LectureForm({
  mode,
  courseId,
  lectureId,
  initial,
  defaultTimezone,
}: {
  mode: "create" | "edit";
  courseId: string;
  lectureId?: string;
  initial?: LectureInitial;
  defaultTimezone: string;
}) {
  const t = useTranslations("admin.lectures.form");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, saved, run, fail } = useSave();

  const [number, setNumber] = useState(initial?.number ? String(initial.number) : "");
  const [titleAr, setTitleAr] = useState(initial?.titleAr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.titleEn ?? "");
  const [descAr, setDescAr] = useState(initial?.descriptionAr ?? "");
  const [descEn, setDescEn] = useState(initial?.descriptionEn ?? "");
  // datetime-local works in the browser's time zone, so it is converted here, in the browser
  const [startsAt, setStartsAt] = useState(() => toLocalInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(initial?.endsAt));
  const [timezone, setTimezone] = useState(initial?.timezone ?? defaultTimezone);
  const [zoomUrl, setZoomUrl] = useState(initial?.zoomUrl ?? "");
  const [zoomMeetingId, setZoomMeetingId] = useState(initial?.zoomMeetingId ?? "");
  const [zoomPassword, setZoomPassword] = useState(initial?.zoomPassword ?? "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(initial?.status ?? "DRAFT");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const start = fromLocalInput(startsAt);
    const end = fromLocalInput(endsAt);
    // An empty date must never reach the API (it would be read as 1970)
    if (!start || !end) {
      fail({ code: "INVALID_DATE" });
      return;
    }
    const body = {
      ...(number.trim() ? { number: Number(number) } : {}),
      titleAr: titleAr.trim(),
      titleEn,
      descriptionAr: descAr,
      descriptionEn: descEn,
      startsAt: start,
      endsAt: end,
      timezone: timezone.trim() || defaultTimezone,
      zoomUrl,
      zoomMeetingId,
      zoomPassword,
      status,
    };
    if (mode === "create") {
      await run(
        () => apiRequest<{ id: string }>("POST", `/api/admin/courses/${courseId}/lectures`, body),
        (d) => router.push(`/admin/courses/${courseId}/lectures/${d.id}`),
      );
    } else {
      await run(
        () => apiRequest("PATCH", `/api/admin/lectures/${lectureId}`, body),
        () => router.refresh(),
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack gap-4" noValidate>
      <div className="form-grid">
        <TextField id="l-number" label={t("number")} hint={t("numberHint")} type="number" min="1" dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} />
        <SelectField id="l-status" label={t("status")} value={status} onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}>
          <option value="DRAFT">{t("statusDraft")}</option>
          <option value="PUBLISHED">{t("statusPublished")}</option>
        </SelectField>
        <TextField id="l-title-ar" label={t("titleAr")} dir="auto" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} required />
        <TextField id="l-title-en" label={t("titleEn")} dir="auto" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        <TextAreaField id="l-desc-ar" label={t("descAr")} rows={3} value={descAr} onChange={(e) => setDescAr(e.target.value)} />
        <TextAreaField id="l-desc-en" label={t("descEn")} rows={3} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
        <TextField id="l-starts" label={t("startsAt")} type="datetime-local" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} suppressHydrationWarning required />
        <TextField id="l-ends" label={t("endsAt")} type="datetime-local" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} suppressHydrationWarning required />
        <TextField id="l-tz" label={t("timezone")} hint={t("timezoneHint")} dir="ltr" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        <TextField id="l-zoom" label={t("zoomUrl")} type="url" dir="ltr" value={zoomUrl} onChange={(e) => setZoomUrl(e.target.value)} />
        <TextField id="l-zoom-id" label={t("zoomMeetingId")} dir="ltr" value={zoomMeetingId} onChange={(e) => setZoomMeetingId(e.target.value)} />
        <TextField id="l-zoom-pw" label={t("zoomPassword")} dir="ltr" value={zoomPassword} onChange={(e) => setZoomPassword(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      <SavedNote saved={saved && mode === "edit"} />
      <div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {mode === "create" ? (busy ? tc("creating") : t("create")) : busy ? tc("saving") : tc("save")}
        </button>
      </div>
    </form>
  );
}
