import { describe, it, expect } from "vitest";
import { renderEmail } from "./email";

const base = { locale: "en" as const, openLabel: "Open", footer: "Footer text" };

describe("renderEmail", () => {
  it("escapes anything that could be read as HTML", () => {
    const mail = renderEmail({ ...base, title: "<b>Hi</b> & \"you\"", body: "a < b", url: null });
    expect(mail.html).not.toContain("<b>Hi</b>");
    expect(mail.html).toContain("&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;you&quot;");
    expect(mail.html).toContain("a &lt; b");
  });

  it("includes the button and link only when there is a link", () => {
    const withLink = renderEmail({ ...base, title: "T", body: "B", url: "https://x.test/en/a?b=1&c=2" });
    expect(withLink.html).toContain('href="https://x.test/en/a?b=1&amp;c=2"');
    expect(withLink.text).toContain("https://x.test/en/a?b=1&c=2");
    const without = renderEmail({ ...base, title: "T", body: "B", url: null });
    expect(without.html).not.toContain("<a ");
    expect(without.text).not.toContain("http");
  });

  it("is right-to-left for Arabic and left-to-right for English", () => {
    expect(renderEmail({ ...base, locale: "ar", title: "T", body: "B", url: null }).html).toContain('dir="rtl"');
    expect(renderEmail({ ...base, locale: "en", title: "T", body: "B", url: null }).html).toContain('dir="ltr"');
  });

  it("uses the title as the subject", () => {
    expect(renderEmail({ ...base, title: "Subject line", body: "B", url: null }).subject).toBe("Subject line");
  });
});
