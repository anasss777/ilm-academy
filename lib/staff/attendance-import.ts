// lib/staff/attendance-import.ts
// Reading an attendance file (a Zoom "participants" report, or any CSV with an email or name
// plus minutes or a status) and deciding what to record. Pure: no database, no framework, so
// every rule here is unit-tested.
//
// Safety principles:
//  - nothing is saved without a preview the person confirms (the service enforces the flow)
//  - students are matched by email first; by name only when exactly ONE student has that name
//  - students missing from the file are NOT marked absent unless asked (they may have joined
//    with a different email)
//  - records entered by hand are kept unless the person chooses to replace them

export type ImportStatus = "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED";

export class AttendanceCsvError extends Error {
  constructor(public readonly code: "EMPTY" | "NO_HEADER") {
    super(code);
  }
}

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

/** Header text without case, spaces or punctuation: "Name (Original Name)" -> "nameoriginalname". */
const normHeader = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");

const EMAIL_HEADERS = new Set(["email", "useremail", "useremailaddress", "emailaddress", "mail", "البريد", "البريدالإلكتروني", "البريدالالكتروني", "الايميل", "الإيميل"]);
const NAME_HEADERS = new Set(["name", "nameoriginalname", "username", "displayname", "fullname", "participant", "participantname", "الاسم", "اسم", "الاسمالكامل"]);
const MINUTE_HEADERS = new Set(["duration", "durationminutes", "durationmin", "durationmins", "minutes", "timeinsession", "totaldurationminutes", "attendedminutes", "المدة", "مدةالحضور", "دقائق"]);
const SECOND_HEADERS = new Set(["durationseconds", "seconds", "durationsec", "ثواني"]);
const STATUS_HEADERS = new Set(["status", "attendance", "attendancestatus", "الحالة", "الحضور"]);

type Columns = { email?: number; name?: number; minutes?: number; secondsToMinutes: boolean; status?: number };

function readColumns(cells: string[]): Columns {
  const c: Columns = { secondsToMinutes: false };
  cells.forEach((cell, i) => {
    const h = normHeader(cell);
    if (!h) return;
    if (c.email === undefined && EMAIL_HEADERS.has(h)) c.email = i;
    else if (c.name === undefined && NAME_HEADERS.has(h)) c.name = i;
    else if (c.minutes === undefined && MINUTE_HEADERS.has(h)) c.minutes = i;
    else if (c.minutes === undefined && SECOND_HEADERS.has(h)) {
      c.minutes = i;
      c.secondsToMinutes = true;
    } else if (c.status === undefined && STATUS_HEADERS.has(h)) c.status = i;
  });
  return c;
}

const score = (c: Columns) => [c.email, c.name, c.minutes, c.status].filter((x) => x !== undefined).length;

/** The separator used by the file: comma, semicolon (common in European Excel) or tab. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 12);
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const line of lines) {
    for (const ch of line) if (ch in counts) counts[ch as keyof typeof counts]++;
  }
  const best = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

type LinedRow = { cells: string[]; line: number };

/** A standard CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes. */
function parseCsvLines(text: string, delimiter: string): LinedRow[] {
  const rows: LinedRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push({ cells: row, line: rowLine });
      row = [];
      field = "";
      line++;
      rowLine = line;
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push({ cells: row, line: rowLine });
  }
  return rows.filter((r) => r.cells.some((f) => f.trim() !== ""));
}

export const parseCsvRows = (text: string, delimiter: string): string[][] => parseCsvLines(text, delimiter).map((r) => r.cells);

/** Minutes from "95", "95.5", "95,5" or "1:35:00". null = empty, NaN = not understood. */
export function parseMinutes(value: string, secondsToMinutes = false): number | null {
  const v = value.trim();
  if (!v) return null;
  const hms = /^(\d+):(\d{2}):(\d{2})$/.exec(v);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3]) / 60;
  const n = Number(v.includes(".") ? v : v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return secondsToMinutes ? n / 60 : n;
}

const STATUS_WORDS: Record<string, ImportStatus> = {
  present: "PRESENT", attended: "PRESENT", yes: "PRESENT", y: "PRESENT", p: "PRESENT", حاضر: "PRESENT", حضر: "PRESENT", نعم: "PRESENT",
  partial: "PARTIAL", late: "PARTIAL", جزئي: "PARTIAL", "حضورجزئي": "PARTIAL",
  absent: "ABSENT", no: "ABSENT", n: "ABSENT", a: "ABSENT", غائب: "ABSENT", غياب: "ABSENT", لا: "ABSENT",
  excused: "EXCUSED", e: "EXCUSED", معذور: "EXCUSED", عذر: "EXCUSED",
};

export function parseStatusWord(value: string): ImportStatus | null | "INVALID" {
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!v) return null;
  return STATUS_WORDS[v] ?? "INVALID";
}

export type ParsedRow = {
  line: number;
  email: string | null;
  name: string | null;
  minutes: number | null;
  status: ImportStatus | null;
};

export type ParsedCsv = {
  delimiter: string;
  headerLine: number;
  columns: { email: boolean; name: boolean; minutes: boolean; status: boolean };
  rows: ParsedRow[];
  invalid: { line: number; reason: "MINUTES" | "STATUS" }[];
  rowCount: number;
};

export function parseAttendanceCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  if (!text.trim()) throw new AttendanceCsvError("EMPTY");

  const delimiter = detectDelimiter(text);
  const lined = parseCsvLines(text, delimiter);
  const all = lined.map((r) => r.cells);

  // A Zoom report starts with a few lines about the meeting. The participants table is the row
  // that has the most recognisable column names.
  let headerIndex = -1;
  let best: Columns | null = null;
  let bestScore = 0;
  for (let i = 0; i < Math.min(all.length, 40); i++) {
    const cols = readColumns(all[i]);
    const s = score(cols);
    if ((cols.email !== undefined || cols.name !== undefined) && s > bestScore) {
      best = cols;
      bestScore = s;
      headerIndex = i;
    }
  }
  if (!best || headerIndex < 0) throw new AttendanceCsvError("NO_HEADER");

  const rows: ParsedRow[] = [];
  const invalid: ParsedCsv["invalid"] = [];
  const cell = (r: string[], i: number | undefined) => (i === undefined ? "" : (r[i] ?? "").trim());

  for (let i = headerIndex + 1; i < all.length; i++) {
    const r = all[i];
    const rawEmail = cell(r, best.email).toLowerCase();
    const email = rawEmail.includes("@") ? rawEmail : null;
    const name = cell(r, best.name) || null;
    if (!email && !name) continue; // nothing to identify the person by

    const minutes = best.minutes === undefined ? null : parseMinutes(cell(r, best.minutes), best.secondsToMinutes);
    if (minutes !== null && Number.isNaN(minutes)) {
      invalid.push({ line: lined[i].line, reason: "MINUTES" });
      continue;
    }
    const status = best.status === undefined ? null : parseStatusWord(cell(r, best.status));
    if (status === "INVALID") {
      invalid.push({ line: lined[i].line, reason: "STATUS" });
      continue;
    }
    rows.push({ line: lined[i].line, email, name, minutes, status });
  }

  return {
    delimiter,
    headerLine: lined[headerIndex].line,
    columns: {
      email: best.email !== undefined,
      name: best.name !== undefined,
      minutes: best.minutes !== undefined,
      status: best.status !== undefined,
    },
    rows,
    invalid,
    rowCount: all.length - headerIndex - 1,
  };
}

// ---------------------------------------------------------------------------
// Matching to students and deciding the status
// ---------------------------------------------------------------------------

/** Names compared loosely: case, spacing, Arabic diacritics and alef/ya/ta-marbuta spellings. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type PlanOptions = {
  /** Present when they stayed at least this share of the lecture (default 75) */
  presentPercent: number;
  /** Partial when they stayed at least this share (default 25); below that: absent */
  partialPercent: number;
  /** Mark enrolled students who are not in the file as absent (off by default) */
  absentMissing: boolean;
  /** Replace records entered by hand (off by default) */
  overwriteManual: boolean;
};

export type StudentRef = { userId: string; email: string; fullName: string };
export type ExistingRecord = { status: ImportStatus; source: "MANUAL" | "IMPORT" | "ZOOM" };

export type PlanEntry = {
  userId: string;
  fullName: string;
  email: string;
  status: ImportStatus;
  minutes: number | null;
  matchedBy: "email" | "name" | "missing";
  /** The status that is there now (it will be replaced), or null */
  replaces: ImportStatus | null;
};

export type ImportPlan = {
  lectureMinutes: number;
  entries: PlanEntry[];
  unmatched: { label: string; minutes: number | null; reason: "NOT_FOUND" | "AMBIGUOUS" }[];
  notInFile: { userId: string; fullName: string; email: string }[];
  skippedManual: { userId: string; fullName: string; existing: ImportStatus; proposed: ImportStatus }[];
  counts: Record<ImportStatus, number>;
};

const RANK: Record<ImportStatus, number> = { PRESENT: 3, PARTIAL: 2, EXCUSED: 1, ABSENT: 0 };
const stronger = (a: ImportStatus, b: ImportStatus) => (RANK[a] >= RANK[b] ? a : b);

/** Present / partial / absent from the time spent, as a share of the lecture's length. */
export function classifyMinutes(minutes: number, lectureMinutes: number, o: Pick<PlanOptions, "presentPercent" | "partialPercent">): ImportStatus {
  const percent = Math.min(100, (minutes / Math.max(1, lectureMinutes)) * 100);
  if (percent >= o.presentPercent - 1e-9) return "PRESENT";
  if (percent >= o.partialPercent - 1e-9) return "PARTIAL";
  return "ABSENT";
}

export function buildPlan(args: {
  parsed: ParsedCsv;
  lectureMinutes: number;
  students: StudentRef[];
  existing: ReadonlyMap<string, ExistingRecord>;
  options: PlanOptions;
}): ImportPlan {
  const { parsed, lectureMinutes, students, existing, options } = args;

  const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s]));
  const byName = new Map<string, StudentRef[]>();
  for (const s of students) {
    const key = normalizeName(s.fullName);
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }

  type Acc = { student: StudentRef; minutes: number | null; status: ImportStatus | null; matchedBy: "email" | "name" };
  const matched = new Map<string, Acc>();
  const unmatchedBy = new Map<string, ImportPlan["unmatched"][number]>();

  for (const row of parsed.rows) {
    let student: StudentRef | undefined;
    let by: "email" | "name" = "email";
    let reason: "NOT_FOUND" | "AMBIGUOUS" = "NOT_FOUND";

    if (row.email) student = byEmail.get(row.email);
    if (!student && row.name) {
      const candidates = byName.get(normalizeName(row.name)) ?? [];
      if (candidates.length === 1) {
        student = candidates[0];
        by = "name";
      } else if (candidates.length > 1) reason = "AMBIGUOUS";
    }

    if (!student) {
      const label = (row.email ?? row.name) as string;
      const key = label.toLowerCase();
      const prev = unmatchedBy.get(key);
      unmatchedBy.set(key, {
        label: prev?.label ?? label,
        minutes: row.minutes == null ? (prev?.minutes ?? null) : (prev?.minutes ?? 0) + row.minutes,
        reason,
      });
      continue;
    }

    // The same person can appear several times (they left and rejoined): add the time up
    const acc = matched.get(student.userId) ?? { student, minutes: null, status: null, matchedBy: by };
    if (row.minutes != null) acc.minutes = (acc.minutes ?? 0) + row.minutes;
    if (row.status) acc.status = acc.status ? stronger(acc.status, row.status) : row.status;
    if (by === "email") acc.matchedBy = "email";
    matched.set(student.userId, acc);
  }

  const entries: PlanEntry[] = [];
  const skippedManual: ImportPlan["skippedManual"] = [];

  const consider = (s: StudentRef, status: ImportStatus, minutes: number | null, matchedBy: PlanEntry["matchedBy"]) => {
    const current = existing.get(s.userId);
    if (current && current.source === "MANUAL" && !options.overwriteManual) {
      skippedManual.push({ userId: s.userId, fullName: s.fullName, existing: current.status, proposed: status });
      return;
    }
    entries.push({ userId: s.userId, fullName: s.fullName, email: s.email, status, minutes, matchedBy, replaces: current?.status ?? null });
  };

  for (const acc of matched.values()) {
    const status =
      acc.status ??
      (acc.minutes != null ? classifyMinutes(acc.minutes, lectureMinutes, options) : "PRESENT"); // listed, no time given: attended
    consider(acc.student, status, acc.minutes, acc.matchedBy);
  }

  const notInFile = students
    .filter((s) => !matched.has(s.userId))
    .map((s) => ({ userId: s.userId, fullName: s.fullName, email: s.email }));
  if (options.absentMissing) {
    for (const s of notInFile) consider(s, "ABSENT", null, "missing");
  }

  const counts: Record<ImportStatus, number> = { PRESENT: 0, PARTIAL: 0, ABSENT: 0, EXCUSED: 0 };
  for (const e of entries) counts[e.status]++;

  return { lectureMinutes, entries, unmatched: [...unmatchedBy.values()], notInFile, skippedManual, counts };
}

/** The thresholds must make sense: 0 < partial < present <= 100. */
export const validThresholds = (present: number, partial: number) =>
  Number.isFinite(present) && Number.isFinite(partial) && partial > 0 && partial < present && present <= 100;
