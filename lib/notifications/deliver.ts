// lib/notifications/deliver.ts
// Sends the emails that are still waiting. Runs from the scheduled job.
//
//  - only types in EMAIL_TYPES, only for people who have email notifications on
//  - only recent notifications (48 hours): an email about something old is noise
//  - a reminder whose moment has passed is dropped, not sent late
//  - a failed send is retried on later runs, up to 3 attempts; a rate-limit answer stops the
//    run without using up an attempt
//  - stops after a time budget so the scheduled function never overruns

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { EMAIL_TYPES } from "./catalog";
import { loadContexts } from "./context";
import { isEmailConfigured, renderEmail, sendEmail, type SendFn } from "./email";
import { TEMPLATES } from "./templates";
import { makeTranslator } from "./translator";
import { buildView, type NotificationContext } from "./view";

const MAX_ATTEMPTS = 3;

/** A reminder is worthless once the lecture has started or the deadline has passed. */
export function isStale(type: string, ctx: NotificationContext, now: Date): boolean {
  if (type.startsWith("lecture.upcoming")) return !!ctx.lectureStartsAt && ctx.lectureStartsAt <= now;
  if (type === "question.due_soon") return !!ctx.questionDueAt && ctx.questionDueAt <= now;
  if (type === "exam.closing_soon") return !!ctx.examDueAt && ctx.examDueAt <= now;
  return false;
}

const siteBaseUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_ORIGIN || "").replace(/\/+$/, "");

export async function deliverPendingEmails(
  db: PrismaClient,
  args: { now?: Date; limit?: number; budgetMs?: number; send?: SendFn; /** only these recipients (tests) */ userIds?: string[] } = {},
) {
  const now = args.now ?? new Date();
  const send = args.send ?? (isEmailConfigured() ? sendEmail : null);
  const summary = { configured: send != null, sent: 0, failed: 0, dropped: 0, rateLimited: false };
  if (!send) return summary;

  const rows = await db.notification.findMany({
    where: {
      emailedAt: null,
      emailAttempts: { lt: MAX_ATTEMPTS },
      ...(args.userIds ? { userId: { in: args.userIds } } : {}),
      createdAt: { gte: new Date(now.getTime() - 48 * 3_600_000) },
      type: { in: [...EMAIL_TYPES] },
      user: { emailNotifications: true, status: "ACTIVE", deletedAt: null },
    },
    orderBy: { createdAt: "asc" },
    take: args.limit ?? 50,
    select: {
      id: true,
      type: true,
      payload: true,
      user: { select: { email: true, locale: true, timezone: true } },
    },
  });
  if (rows.length === 0) return summary;

  const contexts = await loadContexts(db, rows);
  const base = siteBaseUrl();
  const started = Date.now();
  const budget = args.budgetMs ?? 8_000;

  // Two at a time keeps within the provider's rate limit
  for (let i = 0; i < rows.length && !summary.rateLimited && Date.now() - started < budget; i += 2) {
    await Promise.all(
      rows.slice(i, i + 2).map(async (row) => {
        const ctx = contexts.get(row.id) ?? {};
        if (isStale(row.type, ctx, now)) {
          await db.notification.update({ where: { id: row.id }, data: { emailAttempts: MAX_ATTEMPTS, emailError: "STALE" } });
          summary.dropped++;
          return;
        }

        const lang = row.user.locale === "en" ? "en" : "ar";
        const view = buildView({ type: row.type, payload: row.payload, ctx, locale: lang, timezone: row.user.timezone });
        const t = makeTranslator(TEMPLATES[lang]);
        const mail = renderEmail({
          title: view.title,
          body: view.body,
          url: view.path && base ? `${base}/${lang}${view.path}` : null,
          locale: lang,
          openLabel: t("common.openLink"),
          footer: t("common.emailFooter"),
        });

        const result = await send({ to: row.user.email, ...mail });
        if (result.ok) {
          await db.notification.update({ where: { id: row.id }, data: { emailedAt: new Date(), emailError: null } });
          summary.sent++;
        } else if (result.rateLimited) {
          summary.rateLimited = true; // try again next run, attempt not used
        } else {
          await db.notification.update({
            where: { id: row.id },
            data: {
              emailAttempts: result.permanent ? MAX_ATTEMPTS : { increment: 1 },
              emailError: result.error.slice(0, 200),
            },
          });
          summary.failed++;
        }
      }),
    );
  }
  return summary;
}
