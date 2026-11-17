// lib/notifications/catalog.ts
// The notification types, where each one leads, and which are also sent by email.
// Pure: no database, no framework. Shared by the server, the cron job and the tests.

export const NOTIFICATION_TYPES = [
  "enrollment.confirmed",
  "lecture.upcoming_24h",
  "lecture.upcoming_1h",
  "question.published",
  "question.due_soon",
  "question.graded",
  "exam.published",
  "exam.closing_soon",
  "exam.results_released",
  "recording.added",
  "certificate.approved",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const isNotificationType = (value: string): value is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(value);

/**
 * Also sent by email (when email is configured and the student has not opted out).
 * Left in-app only: new question and new recording (frequent, low urgency).
 */
export const EMAIL_TYPES: readonly NotificationType[] = [
  "enrollment.confirmed",
  "lecture.upcoming_24h",
  "lecture.upcoming_1h",
  "question.due_soon",
  "question.graded",
  "exam.published",
  "exam.closing_soon",
  "exam.results_released",
  "certificate.approved",
];

/** "lecture.upcoming_24h" -> "lecture_upcoming_24h" (the key used by the message templates). */
export const typeKey = (type: string) => type.replace(/\./g, "_");

export type Payload = Record<string, unknown>;

export function asPayload(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
}

export const payloadString = (p: Payload, key: string): string | null => {
  const v = p[key];
  return typeof v === "string" && v ? v : null;
};

/** Where a notification leads: a path WITHOUT locale (the link component adds it). */
export function notificationPath(type: string, payload: unknown): string | null {
  const p = asPayload(payload);
  const courseId = payloadString(p, "courseId");
  if (!courseId) return null;
  const base = `/my-courses/${courseId}`;

  switch (type) {
    case "enrollment.confirmed":
      return base;
    case "lecture.upcoming_24h":
    case "lecture.upcoming_1h":
    case "recording.added": {
      const lectureId = payloadString(p, "lectureId");
      return lectureId ? `${base}/lectures/${lectureId}` : `${base}/lectures`;
    }
    case "question.published":
    case "question.due_soon":
    case "question.graded": {
      const questionId = payloadString(p, "questionId");
      return questionId ? `${base}/questions/${questionId}` : `${base}/questions`;
    }
    case "exam.published":
    case "exam.closing_soon":
      return `${base}/exam`;
    case "exam.results_released": {
      const attemptId = payloadString(p, "attemptId");
      return attemptId ? `${base}/exam/attempts/${attemptId}` : `${base}/exam`;
    }
    case "certificate.approved":
      return `${base}/progress`;
    default:
      return null;
  }
}
