import { describe, it, expect } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("uses the saved choice whatever the system says", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("falls back to the system setting when nothing valid is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("sepia", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  // Run the real script against a fake browser to prove it behaves like resolveTheme
  const run = (stored: string | null, systemDark: boolean, storageThrows = false) => {
    const attrs: Record<string, string> = {};
    const fakeWindow = { matchMedia: () => ({ matches: systemDark }) };
    const fakeDocument = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const fakeStorage = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("blocked");
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    };
    new Function("window", "document", "localStorage", THEME_INIT_SCRIPT)(fakeWindow, fakeDocument, fakeStorage);
    return attrs["data-theme"];
  };

  it("applies the saved theme, else the system theme", () => {
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
  });
  it("falls back to light when storage is blocked", () => {
    expect(run(null, true, true)).toBe("light");
  });
});
