import { describe, it, expect } from "vitest";
import { GradingError } from "../grading/grading";
import {
  assertValidSlug,
  deriveEmbedUrl,
  isSafeStoragePath,
  nextCourseStatus,
  publishReadiness,
  validateAttendanceEntries,
  validateExternalUrl,
} from "./rules";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GradingError ? e.code : "OTHER";
  }
  return null;
};

describe("assertValidSlug", () => {
  it("accepts latin and Arabic slugs and normalizes case", () => {
    expect(assertValidSlug("Intro-To-Fiqh")).toBe("intro-to-fiqh");
    expect(assertValidSlug("مدخل-إلى-الفقه")).toBe("مدخل-إلى-الفقه");
    expect(assertValidSlug("fiqh-101")).toBe("fiqh-101");
  });
  it("rejects spaces, symbols, edge hyphens, double hyphens and bad lengths", () => {
    for (const bad of ["Bad Slug", "a/b/c", "-abc", "abc-", "a--b", "ab", "x".repeat(81), "abc!", "../etc"]) {
      expect(codeOf(() => assertValidSlug(bad))).toBe("INVALID_SLUG");
    }
  });
});

describe("nextCourseStatus", () => {
  it("follows DRAFT -> PUBLISHED -> ARCHIVED -> PUBLISHED", () => {
    expect(nextCourseStatus({ from: "DRAFT", action: "publish", activeEnrollments: 0 })).toBe("PUBLISHED");
    expect(nextCourseStatus({ from: "PUBLISHED", action: "archive", activeEnrollments: 9 })).toBe("ARCHIVED");
    expect(nextCourseStatus({ from: "ARCHIVED", action: "unarchive", activeEnrollments: 9 })).toBe("PUBLISHED");
  });
  it("lets an empty published course go back to draft, but not one with students", () => {
    expect(nextCourseStatus({ from: "PUBLISHED", action: "unpublish", activeEnrollments: 0 })).toBe("DRAFT");
    expect(codeOf(() => nextCourseStatus({ from: "PUBLISHED", action: "unpublish", activeEnrollments: 1 }))).toBe("INVALID_STATUS_TRANSITION");
  });
  it("rejects every other move", () => {
    expect(codeOf(() => nextCourseStatus({ from: "DRAFT", action: "archive", activeEnrollments: 0 }))).toBe("INVALID_STATUS_TRANSITION");
    expect(codeOf(() => nextCourseStatus({ from: "PUBLISHED", action: "publish", activeEnrollments: 0 }))).toBe("INVALID_STATUS_TRANSITION");
    expect(codeOf(() => nextCourseStatus({ from: "ARCHIVED", action: "unpublish", activeEnrollments: 0 }))).toBe("INVALID_STATUS_TRANSITION");
  });
});

describe("publishReadiness", () => {
  const ready = {
    titleAr: "دورة",
    shortDescAr: "وصف",
    descriptionAr: "وصف كامل",
    certificateEnabled: false,
    instructorCount: 1,
    hasCertificateRequirement: false,
  };
  it("is empty when everything needed is present", () => {
    expect(publishReadiness(ready)).toEqual([]);
  });
  it("lists what is missing", () => {
    expect(publishReadiness({ ...ready, shortDescAr: " ", descriptionAr: null, instructorCount: 0 })).toEqual([
      "shortDescAr", "descriptionAr", "instructor",
    ]);
  });
  it("requires thresholds only for certificate courses", () => {
    expect(publishReadiness({ ...ready, certificateEnabled: true })).toEqual(["certificateRequirement"]);
    expect(publishReadiness({ ...ready, certificateEnabled: true, hasCertificateRequirement: true })).toEqual([]);
  });
});

describe("validateExternalUrl", () => {
  it("accepts https links on the provider's own hosts", () => {
    expect(validateExternalUrl("YOUTUBE", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain("youtube.com");
    expect(validateExternalUrl("GOOGLE_DRIVE", "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view")).toContain("drive.google.com");
    expect(validateExternalUrl("ONEDRIVE", "https://contoso.sharepoint.com/:v:/s/team/abc")).toContain("sharepoint.com");
    expect(validateExternalUrl("OTHER", "https://files.example/video.mp4")).toContain("files.example");
  });
  it("rejects http, other schemes, credentials and malformed input", () => {
    expect(codeOf(() => validateExternalUrl("OTHER", "http://files.example/a"))).toBe("INVALID_URL");
    expect(codeOf(() => validateExternalUrl("OTHER", "javascript:alert(1)"))).toBe("INVALID_URL");
    expect(codeOf(() => validateExternalUrl("OTHER", "https://user:pw@files.example/a"))).toBe("INVALID_URL");
    expect(codeOf(() => validateExternalUrl("OTHER", "not a url"))).toBe("INVALID_URL");
  });
  it("rejects look-alike hosts for known providers", () => {
    expect(codeOf(() => validateExternalUrl("YOUTUBE", "https://evil.example/watch?v=dQw4w9WgXcQ"))).toBe("INVALID_URL");
    expect(codeOf(() => validateExternalUrl("YOUTUBE", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"))).toBe("INVALID_URL");
    expect(codeOf(() => validateExternalUrl("ONEDRIVE", "https://sharepoint.com.evil.example/x"))).toBe("INVALID_URL");
    expect(codeOf(() => validateExternalUrl("GOOGLE_DRIVE", "https://drive.google.com.evil.example/file/d/x"))).toBe("INVALID_URL");
  });
});

describe("deriveEmbedUrl", () => {
  it("builds a YouTube embed from the common link shapes", () => {
    const expected = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(deriveEmbedUrl("YOUTUBE", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")).toBe(expected);
    expect(deriveEmbedUrl("YOUTUBE", "https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(expected);
    expect(deriveEmbedUrl("YOUTUBE", "https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(expected);
    expect(deriveEmbedUrl("YOUTUBE", "https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(expected);
  });
  it("refuses ids that are not exactly an 11-character YouTube id", () => {
    expect(deriveEmbedUrl("YOUTUBE", "https://www.youtube.com/watch?v=short")).toBeNull();
    expect(deriveEmbedUrl("YOUTUBE", "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22%3E%3Cscript")).toBeNull();
    expect(deriveEmbedUrl("YOUTUBE", "https://www.youtube.com/channel/abc")).toBeNull();
  });
  it("builds a Drive preview URL", () => {
    expect(deriveEmbedUrl("GOOGLE_DRIVE", "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview",
    );
    expect(deriveEmbedUrl("GOOGLE_DRIVE", "https://drive.google.com/open?id=1AbCdEfGhIjKlMn")).toBe(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview",
    );
    expect(deriveEmbedUrl("GOOGLE_DRIVE", "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit")).toBeNull();
  });
  it("never embeds OneDrive or other links", () => {
    expect(deriveEmbedUrl("ONEDRIVE", "https://1drv.ms/v/s!abc")).toBeNull();
    expect(deriveEmbedUrl("OTHER", "https://files.example/video.mp4")).toBeNull();
  });
});

describe("isSafeStoragePath", () => {
  it("accepts ordinary object paths", () => {
    expect(isSafeStoragePath("course-1/lecture-2/notes.pdf")).toBe(true);
  });
  it("rejects traversal, absolute paths and odd characters", () => {
    for (const bad of ["../secret", "a/../b", "/abs/path", "a//b", "a b.pdf", "", "a\\b"]) {
      expect(isSafeStoragePath(bad)).toBe(false);
    }
  });
});

describe("validateAttendanceEntries", () => {
  const active = new Set(["u1", "u2"]);
  it("accepts valid entries, including a clear (status null)", () => {
    expect(codeOf(() => validateAttendanceEntries([{ userId: "u1", status: "PRESENT" }, { userId: "u2", status: null }], active))).toBeNull();
  });
  it("rejects empty batches, duplicates and students outside the course", () => {
    expect(codeOf(() => validateAttendanceEntries([], active))).toBe("INVALID_ATTENDANCE");
    expect(codeOf(() => validateAttendanceEntries([{ userId: "u1", status: "PRESENT" }, { userId: "u1", status: "ABSENT" }], active))).toBe("INVALID_ATTENDANCE");
    expect(codeOf(() => validateAttendanceEntries([{ userId: "stranger", status: "PRESENT" }], active))).toBe("INVALID_ATTENDANCE");
  });
  it("rejects impossible minutes", () => {
    expect(codeOf(() => validateAttendanceEntries([{ userId: "u1", status: "PARTIAL", minutesAttended: -1 }], active))).toBe("INVALID_ATTENDANCE");
    expect(codeOf(() => validateAttendanceEntries([{ userId: "u1", status: "PARTIAL", minutesAttended: 90.5 }], active))).toBe("INVALID_ATTENDANCE");
    expect(codeOf(() => validateAttendanceEntries([{ userId: "u1", status: "PARTIAL", minutesAttended: 90 }], active))).toBeNull();
  });
});
