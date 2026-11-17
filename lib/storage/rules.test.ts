import { describe, it, expect } from "vitest";
import { GradingError } from "../grading/grading";
import {
  MAX_COVER_BYTES,
  MAX_MATERIAL_BYTES,
  buildStoragePath,
  coverImageUrl,
  isStoragePathForCourse,
  validateUpload,
} from "./rules";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GradingError ? e.code : "OTHER";
  }
  return null;
};
const COURSE = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ID = "33333333-3333-3333-3333-333333333333";

describe("validateUpload", () => {
  it("accepts PDF, Word and PowerPoint, deriving the extension and type", () => {
    expect(validateUpload("material", "application/pdf", 1000)).toEqual({ ext: "pdf", materialType: "PDF" });
    expect(validateUpload("material", "application/msword", 1000).ext).toBe("doc");
    expect(validateUpload("material", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1000).ext).toBe("docx");
    expect(validateUpload("material", "Application/PDF; charset=binary", 1000).ext).toBe("pdf");
  });
  it("rejects everything else, including executables and html", () => {
    for (const t of ["text/html", "application/x-msdownload", "image/svg+xml", "application/zip", ""]) {
      expect(codeOf(() => validateUpload("material", t, 1000))).toBe("INVALID_UPLOAD");
    }
  });
  it("enforces size limits and rejects nonsense sizes", () => {
    expect(codeOf(() => validateUpload("material", "application/pdf", MAX_MATERIAL_BYTES + 1))).toBe("INVALID_UPLOAD");
    expect(codeOf(() => validateUpload("material", "application/pdf", MAX_MATERIAL_BYTES))).toBeNull();
    expect(codeOf(() => validateUpload("material", "application/pdf", 0))).toBe("INVALID_UPLOAD");
    expect(codeOf(() => validateUpload("material", "application/pdf", 12.5))).toBe("INVALID_UPLOAD");
  });
  it("accepts raster cover images only (no SVG, which can carry scripts)", () => {
    expect(validateUpload("cover", "image/webp", 1000).ext).toBe("webp");
    expect(validateUpload("cover", "image/jpeg", 1000).ext).toBe("jpg");
    expect(codeOf(() => validateUpload("cover", "image/svg+xml", 1000))).toBe("INVALID_UPLOAD");
    expect(codeOf(() => validateUpload("cover", "image/png", MAX_COVER_BYTES + 1))).toBe("INVALID_UPLOAD");
  });
});

describe("storage paths", () => {
  it("builds ASCII paths inside the course's own folder", () => {
    expect(buildStoragePath("material", COURSE, ID, "pdf")).toBe(`courses/${COURSE}/${ID}.pdf`);
    expect(buildStoragePath("cover", COURSE, ID, "png")).toBe(`covers/${COURSE}/${ID}.png`);
  });
  it("accepts only paths inside the right course and kind", () => {
    const p = buildStoragePath("material", COURSE, ID, "pdf");
    expect(isStoragePathForCourse("material", p, COURSE)).toBe(true);
    expect(isStoragePathForCourse("material", p, OTHER)).toBe(false);
    expect(isStoragePathForCourse("cover", p, COURSE)).toBe(false);
  });
  it("rejects traversal inside the right prefix", () => {
    expect(isStoragePathForCourse("material", `courses/${COURSE}/../${OTHER}/x.pdf`, COURSE)).toBe(false);
    expect(isStoragePathForCourse("material", `courses/${COURSE}//x.pdf`, COURSE)).toBe(false);
  });
});

describe("coverImageUrl", () => {
  it("builds the public URL and passes null through", () => {
    expect(coverImageUrl("https://abc.supabase.co/", "covers/x/y.png")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/course-covers/covers/x/y.png",
    );
    expect(coverImageUrl("https://abc.supabase.co", null)).toBeNull();
  });
});
