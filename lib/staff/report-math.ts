// lib/staff/report-math.ts
// The arithmetic behind the reports. Pure, so it can be tested without a database.

export const percentOf = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);

export const average = (values: readonly number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export type AttendanceCounts = { PRESENT: number; PARTIAL: number; ABSENT: number; EXCUSED: number };

/**
 * Share of attendance that counts as attending. Excused students and students whose attendance
 * was never recorded are left out of the calculation (the same idea as certificate eligibility);
 * a partial attendance counts by the course's partial weight.
 */
export function attendanceRate(c: AttendanceCounts, partialWeight = 1): number | null {
  const considered = c.PRESENT + c.PARTIAL + c.ABSENT;
  return considered > 0 ? ((c.PRESENT + c.PARTIAL * partialWeight) / considered) * 100 : null;
}

/** Monday 00:00 UTC of the week containing the date. */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - daysSinceMonday * 86_400_000);
}

/** How many of the dates fall in each of the last `weeks` weeks (oldest first, current week last). */
export function weeklyCounts(dates: readonly Date[], now: Date, weeks: number): { weekStart: Date; count: number }[] {
  const thisWeek = startOfWeek(now).getTime();
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(thisWeek - (weeks - 1 - i) * 7 * 86_400_000),
    count: 0,
  }));
  for (const d of dates) {
    const index = weeks - 1 - Math.floor((thisWeek - startOfWeek(d).getTime()) / (7 * 86_400_000));
    if (index >= 0 && index < weeks) buckets[index].count++;
  }
  return buckets;
}

/** Percentages grouped into equal buckets (0-9.99, 10-19.99 ... 90-100). 100 belongs to the last bucket. */
export function histogram(percents: readonly number[], bucketSize = 10): { from: number; to: number; count: number }[] {
  const n = Math.ceil(100 / bucketSize);
  const buckets = Array.from({ length: n }, (_, i) => ({ from: i * bucketSize, to: Math.min(100, (i + 1) * bucketSize), count: 0 }));
  for (const p of percents) {
    if (!Number.isFinite(p)) continue;
    buckets[Math.max(0, Math.min(n - 1, Math.floor(p / bucketSize)))].count++;
  }
  return buckets;
}
