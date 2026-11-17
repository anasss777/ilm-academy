import { describe, it, expect } from "vitest";
import { TEMPLATES } from "./templates";
import { NOTIFICATION_TYPES, typeKey } from "./catalog";
import { makeTranslator } from "./translator";
import { buildView } from "./view";

const C = "11111111-1111-4111-8111-111111111111";
const L = "22222222-2222-4222-8222-222222222222";

describe("templates", () => {
  it("every notification type has a title and body in both languages", () => {
    for (const lang of ["ar", "en"] as const) {
      for (const type of NOTIFICATION_TYPES) {
        const item = TEMPLATES[lang].items[typeKey(type)];
        expect(item, `${lang}:${type}`).toBeDefined();
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("both languages use the same placeholders", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const type of NOTIFICATION_TYPES) {
      const ar = TEMPLATES.ar.items[typeKey(type)];
      const en = TEMPLATES.en.items[typeKey(type)];
      // The body may use fewer placeholders in one language, but never one the other lacks entirely
      for (const field of ["title", "body"] as const) {
        const a = new Set(names(ar[field]).split(",").filter(Boolean));
        const e = new Set(names(en[field]).split(",").filter(Boolean));
        expect([...a].sort()).toEqual([...e].sort());
      }
    }
  });
});

describe("makeTranslator", () => {
  const t = makeTranslator({ a: { b: "Hello {name}" } });
  it("fills placeholders and keeps unknown ones visible", () => {
    expect(t("a.b", { name: "Sara" })).toBe("Hello Sara");
    expect(t("a.b")).toBe("Hello {name}");
  });
  it("returns the key for a missing message", () => {
    expect(t("a.zzz")).toBe("a.zzz");
  });
});

describe("buildView", () => {
  it("builds an upcoming-lecture message with the course, lecture and time", () => {
    const view = buildView({
      type: "lecture.upcoming_24h",
      payload: { courseId: C, lectureId: L },
      ctx: {
        courseTitleAr: "دورة", courseTitleEn: "Course",
        lectureNumber: 3, lectureStartsAt: new Date("2026-10-03T18:00:00Z"),
      },
      locale: "en",
      timezone: "UTC",
    });
    expect(view.title).toBe("Lecture 3 is coming up");
    expect(view.body).toContain("Course");
    expect(view.path).toBe(`/my-courses/${C}/lectures/${L}`);
    expect(view.body).not.toContain("{");
  });

  it("says there is no deadline when the question has none", () => {
    const view = buildView({
      type: "question.published",
      payload: { courseId: C },
      ctx: { courseTitleAr: "دورة", lectureNumber: 1, questionDueAt: null },
      locale: "ar",
      timezone: "UTC",
    });
    expect(view.body).toContain("بلا موعد نهائي");
  });

  it("uses Arabic as the fallback title when English is missing", () => {
    const view = buildView({
      type: "certificate.approved",
      payload: { courseId: C },
      ctx: { courseTitleAr: "دورة عربية", courseTitleEn: null },
      locale: "en",
      timezone: "UTC",
    });
    expect(view.body).toContain("دورة عربية");
  });

  it("handles an unknown type without throwing", () => {
    const view = buildView({ type: "future.thing", payload: {}, ctx: {}, locale: "en", timezone: "UTC" });
    expect(view.title).toBe("New notification");
    expect(view.path).toBeNull();
  });
});
