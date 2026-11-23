import { describe, it, expect } from "vitest";
import {
  AttendanceCsvError,
  buildPlan,
  classifyMinutes,
  detectDelimiter,
  normalizeName,
  parseAttendanceCsv,
  parseCsvRows,
  parseMinutes,
  parseStatusWord,
  validThresholds,
  type ExistingRecord,
  type PlanOptions,
  type StudentRef,
} from "./attendance-import";

const opts: PlanOptions = { presentPercent: 75, partialPercent: 25, absentMissing: false, overwriteManual: false };

describe("parseCsvRows", () => {
  it("handles quotes, commas inside quotes, doubled quotes and CRLF", () => {
    const rows = parseCsvRows('a,b\r\n"x, y","he said ""hi"""\r\n', ",");
    expect(rows).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("keeps line breaks inside quotes and drops blank lines", () => {
    expect(parseCsvRows('a\n"l1\nl2"\n\n', ",")).toEqual([["a"], ["l1\nl2"]]);
  });
});

describe("detectDelimiter", () => {
  it("finds comma, semicolon and tab", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
});

describe("parseMinutes / parseStatusWord", () => {
  it("understands several ways to write minutes", () => {
    expect(parseMinutes("95")).toBe(95);
    expect(parseMinutes("95.5")).toBe(95.5);
    expect(parseMinutes("95,5")).toBe(95.5);
    expect(parseMinutes("1:30:00")).toBe(90);
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("abc")).toBeNaN();
    expect(parseMinutes("-3")).toBeNaN();
    expect(parseMinutes("120", true)).toBe(2);
  });
  it("maps English and Arabic status words", () => {
    expect(parseStatusWord("Present")).toBe("PRESENT");
    expect(parseStatusWord("حاضر")).toBe("PRESENT");
    expect(parseStatusWord("Partial")).toBe("PARTIAL");
    expect(parseStatusWord("غائب")).toBe("ABSENT");
    expect(parseStatusWord("معذور")).toBe("EXCUSED");
    expect(parseStatusWord("")).toBeNull();
    expect(parseStatusWord("maybe")).toBe("INVALID");
  });
});

describe("parseAttendanceCsv", () => {
  it("reads a simple email,minutes file", () => {
    const p = parseAttendanceCsv("email,minutes\nA@x.com,60\nb@x.com,10\n");
    expect(p.columns).toEqual({ email: true, name: false, minutes: true, status: false });
    expect(p.rows.map((r) => [r.email, r.minutes])).toEqual([["a@x.com", 60], ["b@x.com", 10]]);
  });

  it("finds the participants table below the meeting summary of a Zoom report", () => {
    const zoom = [
      "Topic,ID,Host,Email,Start time,End time,Participants",
      '"Fiqh lecture",123,Sara,sara@teacher.com,2026-10-03 18:00,2026-10-03 19:00,3',
      "",
      '"Name (original name)","User email","Join time","Leave time","Duration (minutes)","Guest"',
      '"Ali, Mohamed",ali@x.com,18:00,18:30,30,No',
      '"Ali, Mohamed",ali@x.com,18:35,19:05,30,No',
      "Guest One,,18:10,18:20,10,Yes",
    ].join("\n");
    const p = parseAttendanceCsv(zoom);
    expect(p.headerLine).toBe(4);
    expect(p.columns).toMatchObject({ email: true, name: true, minutes: true });
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0]).toMatchObject({ email: "ali@x.com", name: "Ali, Mohamed", minutes: 30 });
    expect(p.rows[2]).toMatchObject({ email: null, name: "Guest One", minutes: 10 });
  });

  it("accepts a BOM, semicolons, and Arabic headers", () => {
    const p = parseAttendanceCsv("\uFEFFالبريد الإلكتروني;الحالة\nA@X.com;حاضر\nb@x.com;غائب\n");
    expect(p.delimiter).toBe(";");
    expect(p.rows.map((r) => r.status)).toEqual(["PRESENT", "ABSENT"]);
  });

  it("reports rows it cannot understand instead of guessing", () => {
    const p = parseAttendanceCsv("email,minutes,status\na@x.com,abc,\nb@x.com,,maybe\nc@x.com,5,present\n");
    expect(p.invalid.map((i) => i.reason)).toEqual(["MINUTES", "STATUS"]);
    expect(p.rows).toHaveLength(1);
  });

  it("refuses an empty file or one without an email or name column", () => {
    expect(() => parseAttendanceCsv("")).toThrow(AttendanceCsvError);
    expect(() => parseAttendanceCsv("foo,bar\n1,2\n")).toThrow(AttendanceCsvError);
    try {
      parseAttendanceCsv("  \n ");
    } catch (e) {
      expect((e as AttendanceCsvError).code).toBe("EMPTY");
    }
  });

  it("reports the line numbers of the original file, blank lines included", () => {
    const p = parseAttendanceCsv("email,minutes\n\na@x.com,abc\nb@x.com,5\n");
    expect(p.invalid).toEqual([{ line: 3, reason: "MINUTES" }]);
    expect(p.rows[0].line).toBe(4);
  });

  it("skips rows with no email and no name", () => {
    expect(parseAttendanceCsv("email,minutes\n,50\na@x.com,5\n").rows).toHaveLength(1);
  });
});

describe("normalizeName", () => {
  it("ignores case, spacing and Arabic spelling variants", () => {
    expect(normalizeName("  Ahmed   BEN Ali ")).toBe("ahmed ben ali");
    expect(normalizeName("أحمد")).toBe(normalizeName("احمد"));
    expect(normalizeName("فاطمةَ")).toBe(normalizeName("فاطمه"));
  });
});

describe("classifyMinutes", () => {
  it("uses the share of the lecture, capped at 100%", () => {
    expect(classifyMinutes(60, 60, opts)).toBe("PRESENT");
    expect(classifyMinutes(200, 60, opts)).toBe("PRESENT");
    expect(classifyMinutes(45, 60, opts)).toBe("PRESENT"); // exactly 75%
    expect(classifyMinutes(44, 60, opts)).toBe("PARTIAL");
    expect(classifyMinutes(15, 60, opts)).toBe("PARTIAL"); // exactly 25%
    expect(classifyMinutes(14, 60, opts)).toBe("ABSENT");
  });
  it("validates thresholds", () => {
    expect(validThresholds(75, 25)).toBe(true);
    expect(validThresholds(50, 50)).toBe(false);
    expect(validThresholds(101, 25)).toBe(false);
    expect(validThresholds(75, 0)).toBe(false);
  });
});

describe("buildPlan", () => {
  const students: StudentRef[] = [
    { userId: "u1", email: "ali@x.com", fullName: "Ali Mohamed" },
    { userId: "u2", email: "sara@x.com", fullName: "Sara Ben Salah" },
    { userId: "u3", email: "omar@x.com", fullName: "Omar Trabelsi" },
    { userId: "u4", email: "a1@x.com", fullName: "Same Name" },
    { userId: "u5", email: "a2@x.com", fullName: "Same Name" },
    { userId: "u6", email: "nour@x.com", fullName: "Nour" },
  ];
  const plan = (csv: string, over: Partial<PlanOptions> = {}, existing: Record<string, ExistingRecord> = {}) =>
    buildPlan({
      parsed: parseAttendanceCsv(csv),
      lectureMinutes: 60,
      students,
      existing: new Map(Object.entries(existing)),
      options: { ...opts, ...over },
    });

  it("adds up rejoin rows and classifies by time", () => {
    const p = plan("email,minutes\nali@x.com,30\nali@x.com,30\nsara@x.com,20\nomar@x.com,2\n");
    const by = Object.fromEntries(p.entries.map((e) => [e.userId, e]));
    expect(by.u1).toMatchObject({ status: "PRESENT", minutes: 60, matchedBy: "email" });
    expect(by.u2.status).toBe("PARTIAL");
    expect(by.u3.status).toBe("ABSENT");
    expect(p.counts).toEqual({ PRESENT: 1, PARTIAL: 1, ABSENT: 1, EXCUSED: 0 });
  });

  it("matches by name only when the name is unique, and reports the rest", () => {
    const p = plan("name,minutes\nsara ben salah,60\nSame Name,60\nStranger,60\n");
    expect(p.entries.map((e) => [e.userId, e.matchedBy])).toEqual([["u2", "name"]]);
    expect(p.unmatched.map((u) => [u.label, u.reason])).toEqual([["Same Name", "AMBIGUOUS"], ["Stranger", "NOT_FOUND"]]);
  });

  it("prefers the email and falls back to the name when the email is not ours", () => {
    const p = plan("name,email,minutes\nAli Mohamed,other@gmail.com,60\n");
    expect(p.entries[0]).toMatchObject({ userId: "u1", matchedBy: "name" });
  });

  it("uses an explicit status over minutes, and treats a bare list as present", () => {
    expect(plan("email,status\nali@x.com,partial\nsara@x.com,excused\n").entries.map((e) => e.status)).toEqual(["PARTIAL", "EXCUSED"]);
    expect(plan("email\nali@x.com\n").entries[0].status).toBe("PRESENT");
  });

  it("lists enrolled students who are not in the file, and does not mark them absent by default", () => {
    const p = plan("email,minutes\nali@x.com,60\n");
    expect(p.notInFile.map((s) => s.userId)).toEqual(["u2", "u3", "u4", "u5", "u6"]);
    expect(p.entries).toHaveLength(1);
  });

  it("marks missing students absent only when asked", () => {
    const p = plan("email,minutes\nali@x.com,60\n", { absentMissing: true });
    expect(p.entries).toHaveLength(6);
    expect(p.entries.filter((e) => e.matchedBy === "missing").every((e) => e.status === "ABSENT")).toBe(true);
  });

  it("keeps records entered by hand unless told to replace them", () => {
    const existing = { u1: { status: "EXCUSED", source: "MANUAL" } as ExistingRecord, u2: { status: "PRESENT", source: "IMPORT" } as ExistingRecord };
    const kept = plan("email,minutes\nali@x.com,60\nsara@x.com,5\n", {}, existing);
    expect(kept.skippedManual).toEqual([{ userId: "u1", fullName: "Ali Mohamed", existing: "EXCUSED", proposed: "PRESENT" }]);
    expect(kept.entries.map((e) => [e.userId, e.replaces])).toEqual([["u2", "PRESENT"]]); // an earlier import is replaced
    const replaced = plan("email,minutes\nali@x.com,60\n", { overwriteManual: true }, existing);
    expect(replaced.skippedManual).toHaveLength(0);
    expect(replaced.entries[0]).toMatchObject({ userId: "u1", replaces: "EXCUSED" });
  });

  it("does not overwrite a manual record with 'absent' for a missing student", () => {
    const p = plan("email,minutes\nali@x.com,60\n", { absentMissing: true }, { u2: { status: "PRESENT", source: "MANUAL" } });
    expect(p.skippedManual.map((s) => s.userId)).toEqual(["u2"]);
    expect(p.entries.some((e) => e.userId === "u2")).toBe(false);
  });
});
