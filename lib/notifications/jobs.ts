// lib/notifications/jobs.ts
// The scheduled notification job: create due reminders, send waiting emails, tidy old rows.
// One step failing never stops the others.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { deliverPendingEmails } from "./deliver";
import { generateReminders } from "./reminders";
import { purgeOldNotifications } from "./service";

export async function runNotificationJobs(db: PrismaClient, now: Date = new Date()) {
  const summary = {
    reminders: null as Awaited<ReturnType<typeof generateReminders>> | null,
    email: null as Awaited<ReturnType<typeof deliverPendingEmails>> | null,
    purged: 0,
    errors: [] as string[],
  };

  try {
    summary.reminders = await generateReminders(db, now);
  } catch (err) {
    console.error("[notifications] reminders failed", err);
    summary.errors.push("reminders");
  }
  try {
    summary.email = await deliverPendingEmails(db, { now });
  } catch (err) {
    console.error("[notifications] email delivery failed", err);
    summary.errors.push("email");
  }
  try {
    summary.purged = (await purgeOldNotifications(db, now)).deleted;
  } catch (err) {
    console.error("[notifications] purge failed", err);
    summary.errors.push("purge");
  }
  return summary;
}
