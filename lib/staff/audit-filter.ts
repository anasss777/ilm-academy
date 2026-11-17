// lib/staff/audit-filter.ts
// Turning the audit screen's query string into a safe filter. Pure (no database, no framework).
// Everything that arrives in a URL is untrusted: each value is validated or dropped.

export const AUDIT_AREAS = [
  "course", "enrollment", "lecture", "recording", "material", "attendance",
  "question", "submission", "exam", "certificate", "user", "role", "audit",
] as const;

/** Every action the application writes. A test checks each has a label in both languages. */
export const KNOWN_AUDIT_ACTIONS = [
  "course.create", "course.update", "course.settings", "course.content", "course.instructors",
  "course.publish", "course.unpublish", "course.archive", "course.unarchive",
  "enrollment.staff_add", "enrollment.staff_reactivate", "enrollment.staff_withdraw",
  "user.consent.grant", "user.consent.withdraw",
  "lecture.create", "lecture.update", "lecture.delete",
  "recording.create", "recording.update", "recording.delete",
  "material.create", "material.update", "material.delete",
  "attendance.save",
  "question.create", "question.update", "question.delete",
  "submission.grade", "submission.release", "submission.excuse", "submission.excuse.revoke",
  "submission.reopen", "submission.extend",
  "exam.create", "exam.update", "exam.delete", "exam.grade", "exam.release", "exam.reopen",
  "certificate.requirements.update", "certificate.decide", "certificate.export", "certificate.export.download",
  "user.role.grant", "user.role.revoke",
  "role.create", "role.update", "role.delete",
  "audit.export",
] as const;

/** "course.create" -> "course_create": message keys cannot contain dots. */
export const actionMessageKey = (action: string) => action.replace(/\./g, "_");

export type AuditFilter = {
  q?: string;
  area?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  /** Exclusive upper bound: the start of the day AFTER the chosen "to" date */
  toExclusive?: Date;
};

/**
 * The instant a calendar day starts in a time zone ("2026-10-03" in Africa/Tunis is
 * 2026-10-02T23:00Z). Null for a malformed date or an unknown zone.
 */
export function zonedDayStart(date: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const guess = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(guess.getTime()) || guess.toISOString().slice(0, 10) !== date) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(guess);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    const offsetMinutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
    return new Date(guess.getTime() - offsetMinutes * 60_000);
  } catch {
    return null; // unknown time zone
  }
}

const nextDay = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `filter` is what the database query uses; `query` is the cleaned-up set of parameters to put
 * back into page links (so a bad value never survives into the next page's URL).
 */
export function parseAuditFilter(sp: Record<string, string | undefined>, timeZone: string) {
  const filter: AuditFilter = {};
  const query: Record<string, string> = {};

  const q = (sp.q ?? "").trim().slice(0, 100);
  if (q) {
    filter.q = q;
    query.q = q;
  }
  if (sp.area && (AUDIT_AREAS as readonly string[]).includes(sp.area)) {
    filter.area = sp.area;
    query.area = sp.area;
  }
  if (sp.entityType && /^[A-Za-z]{2,40}$/.test(sp.entityType)) {
    filter.entityType = sp.entityType;
    query.entityType = sp.entityType;
  }
  if (sp.entityId && UUID.test(sp.entityId)) {
    filter.entityId = sp.entityId;
    query.entityId = sp.entityId;
  }
  if (sp.actor && UUID.test(sp.actor)) {
    filter.actorId = sp.actor;
    query.actor = sp.actor;
  }
  const from = sp.from ? zonedDayStart(sp.from, timeZone) : null;
  if (from && sp.from) {
    filter.from = from;
    query.from = sp.from;
  }
  const to = sp.to && zonedDayStart(sp.to, timeZone) ? zonedDayStart(nextDay(sp.to), timeZone) : null;
  if (to && sp.to) {
    filter.toExclusive = to;
    query.to = sp.to;
  }
  return { filter, query };
}
