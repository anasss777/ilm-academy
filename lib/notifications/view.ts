// lib/notifications/view.ts
// Turns a stored notification (type + ids) into what the person reads: title, body and link.
// Pure given the context, so the in-app list and the emails say exactly the same thing.

import { formatDateTime } from "../format";
import { localized } from "../i18n-content";
import { notificationPath, typeKey } from "./catalog";
import { TEMPLATES } from "./templates";
import { makeTranslator } from "./translator";

/** Titles and dates loaded for one notification (see context.ts). */
export type NotificationContext = {
  courseTitleAr?: string | null;
  courseTitleEn?: string | null;
  lectureNumber?: number | null;
  lectureTitleAr?: string | null;
  lectureTitleEn?: string | null;
  lectureStartsAt?: Date | null;
  questionDueAt?: Date | null;
  examDueAt?: Date | null;
};

export type NotificationView = { title: string; body: string; path: string | null };

export function buildView(args: {
  type: string;
  payload: unknown;
  ctx: NotificationContext;
  locale: string;
  timezone: string;
}): NotificationView {
  const { type, payload, ctx, timezone } = args;
  const lang = args.locale === "en" ? "en" : "ar";
  const dictionary = TEMPLATES[lang];
  const t = makeTranslator(dictionary);
  const key = typeKey(type);
  const path = notificationPath(type, payload);

  if (!(key in dictionary.items)) {
    return { title: t("common.unknownTitle"), body: "", path };
  }

  // The date that matters depends on the kind of notification
  const when = type.startsWith("lecture.")
    ? ctx.lectureStartsAt
    : type.startsWith("exam.")
      ? ctx.examDueAt
      : ctx.questionDueAt;
  const date = when ? formatDateTime(when, lang, timezone) : "";

  const vars = {
    course: localized(lang, ctx.courseTitleAr, ctx.courseTitleEn),
    lecture:
      ctx.lectureNumber != null
        ? t("common.lectureLabel", { number: String(ctx.lectureNumber) })
        : localized(lang, ctx.lectureTitleAr, ctx.lectureTitleEn),
    date,
    due: when ? t("common.dueOn", { date }) : t("common.noDeadline"),
  };

  return {
    title: t(`items.${key}.title`, vars),
    body: t(`items.${key}.body`, vars),
    path,
  };
}
