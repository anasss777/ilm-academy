import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("neutralizes formula starters", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(csvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(csvCell("-2+3+cmd")).toBe("'-2+3+cmd");
    expect(csvCell('=HYPERLINK("http://evil.example","x")')).toBe('"\'=HYPERLINK(""http://evil.example"",""x"")"');
  });
  it("leaves phone numbers and numbers untouched", () => {
    expect(csvCell("+216 12 345 678")).toBe("+216 12 345 678");
    expect(csvCell("+1 (555) 010-9999")).toBe("+1 (555) 010-9999");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(83.33)).toBe("83.33");
  });
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Smith, John")).toBe('"Smith, John"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("keeps Arabic text as is", () => {
    expect(csvCell("محمد أحمد")).toBe("محمد أحمد");
  });
});

describe("toCsv", () => {
  it("starts with a BOM, uses CRLF and ends with a line break", () => {
    const out = toCsv(["name", "email"], [["محمد", "m@example.test"]]);
    expect(out.startsWith("\uFEFFname,email\r\n")).toBe(true);
    expect(out).toContain("محمد,m@example.test");
    expect(out.endsWith("\r\n")).toBe(true);
  });
});
