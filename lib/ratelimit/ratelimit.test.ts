import { describe, it, expect } from "vitest";
import { clientIp, rateLimitDecision, windowStartFor } from "./ratelimit";

describe("windowStartFor", () => {
  it("aligns to the start of the window", () => {
    expect(
      windowStartFor(new Date("2026-10-01T12:00:37Z"), 60).toISOString(),
    ).toBe("2026-10-01T12:00:00.000Z");
    expect(
      windowStartFor(new Date("2026-10-01T12:07:00Z"), 300).toISOString(),
    ).toBe("2026-10-01T12:05:00.000Z");
  });
  it("is stable inside a window and moves at the boundary", () => {
    const a = windowStartFor(
      new Date("2026-10-01T12:00:59.999Z"),
      60,
    ).getTime();
    const b = windowStartFor(
      new Date("2026-10-01T12:01:00.000Z"),
      60,
    ).getTime();
    expect(b - a).toBe(60_000);
  });
});

describe("rateLimitDecision", () => {
  const now = new Date("2026-10-01T12:00:45Z");
  it("allows up to the limit and then refuses", () => {
    expect(
      rateLimitDecision({ count: 3, limit: 3, now, windowSeconds: 60 }),
    ).toMatchObject({ allowed: true, remaining: 0 });
    expect(
      rateLimitDecision({ count: 4, limit: 3, now, windowSeconds: 60 }).allowed,
    ).toBe(false);
    expect(
      rateLimitDecision({ count: 1, limit: 3, now, windowSeconds: 60 })
        .remaining,
    ).toBe(2);
  });
  it("tells the client how long until the window resets", () => {
    expect(
      rateLimitDecision({ count: 9, limit: 3, now, windowSeconds: 60 })
        .retryAfterSeconds,
    ).toBe(15);
  });
  it("never reports a retry time below one second", () => {
    const edge = new Date("2026-10-01T12:00:59.999Z");
    expect(
      rateLimitDecision({ count: 9, limit: 3, now: edge, windowSeconds: 60 })
        .retryAfterSeconds,
    ).toBe(1);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://x.test", { headers });
  it("uses the first forwarded address", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });
  it("falls back to x-real-ip, then to a placeholder", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
