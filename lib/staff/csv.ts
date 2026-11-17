// lib/staff/csv.ts
// CSV for the certificate export.
//
// Names and emails are typed by students, and the file will be opened in Excel by the
// instructor and the certificate organization. A cell that starts with = + - or @ can be run
// as a formula (CSV injection), so such cells get a leading apostrophe. Numbers and phone
// numbers ("+216 12 345 678", "-3") are left alone: they look numeric and cannot execute.

const NUMERIC_LIKE = /^[+-]?[0-9][0-9 ().-]*$/;

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC_LIKE.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with a BOM so Excel shows Arabic correctly; CRLF line endings. */
export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
