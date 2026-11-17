// lib/ui/datetime.ts
// <input type="datetime-local"> works in the browser's own time zone and has no zone in its value.
// These two functions convert between that and the UTC instants the API stores.

const pad = (n: number) => String(n).padStart(2, "0");

/** The browser-local wall-clock value for an instant, e.g. "2026-10-03T18:00". */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The UTC instant (ISO string) for a datetime-local value, or null when empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
