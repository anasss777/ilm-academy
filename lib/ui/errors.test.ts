import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { KNOWN_API_ERRORS, apiErrorKey } from "./errors";

// Vitest runs from the project root, wherever this file lives
const messages = (locale: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as {
    apiErrors: Record<string, string>;
  };

describe("apiErrorKey", () => {
  it("passes known codes through and falls back for anything else", () => {
    expect(apiErrorKey("DEADLINE_PASSED")).toBe("DEADLINE_PASSED");
    expect(apiErrorKey("SOMETHING_NEW")).toBe("FAILED");
    expect(apiErrorKey("")).toBe("FAILED");
  });

  it("every known code has a message in both languages", () => {
    for (const locale of ["ar", "en"]) {
      const catalog = messages(locale).apiErrors;
      for (const code of KNOWN_API_ERRORS) {
        expect(typeof catalog[code]).toBe("string");
      }
    }
  });
});
