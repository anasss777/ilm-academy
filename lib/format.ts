// lib/format.ts
// Dates and numbers for the UI.
//
// Digits: Arabic text is shown with Western digits (0-9), which matches phone numbers, percentages
// and what readers in the Maghreb expect. To switch the whole site to Arabic-Indic digits,
// change DIGITS to "arab".

const DIGITS: "latn" | "arab" = "latn";

const tag = (locale: string) => `${locale}-u-nu-${DIGITS}`;

function safeFormat(fn: () => string, fallback: string): string {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** "Saturday, 3 October 2026 at 18:30", in the given time zone (falls back to the server's). */
export function formatDateTime(
  date: Date,
  locale: string,
  timeZone?: string | null,
): string {
  return safeFormat(
    () =>
      new Intl.DateTimeFormat(tag(locale), {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: timeZone || undefined,
      }).format(date),
    date.toISOString(),
  );
}

export function formatDate(
  date: Date,
  locale: string,
  timeZone?: string | null,
): string {
  return safeFormat(
    () =>
      new Intl.DateTimeFormat(tag(locale), {
        dateStyle: "long",
        timeZone: timeZone || undefined,
      }).format(date),
    date.toISOString().slice(0, 10),
  );
}

export function formatNumber(
  value: number,
  locale: string,
  maximumFractionDigits = 2,
): string {
  return safeFormat(
    () =>
      new Intl.NumberFormat(tag(locale), { maximumFractionDigits }).format(
        value,
      ),
    String(value),
  );
}

/** Returns a string, never a number, so message templates cannot re-format the digits. */
export function formatPercent(value: number, locale: string): string {
  return `${formatNumber(value, locale, 1)}%`;
}

/** "Arabic" / "العربية" for an ISO code; the code itself if it is not recognized. */
export function languageName(locale: string, code: string): string {
  return safeFormat(
    () =>
      new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code,
    code,
  );
}
