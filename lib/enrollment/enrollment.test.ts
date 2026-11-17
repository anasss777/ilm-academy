import { describe, it, expect } from "vitest";
import { GradingError } from "../grading/grading";
import { decideEnrollment } from "./enrollment";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GradingError ? e.code : "OTHER";
  }
  return null;
};

describe("decideEnrollment", () => {
  it("creates an enrollment for a new student in an open published course", () => {
    expect(decideEnrollment({ courseStatus: "PUBLISHED", enrollmentOpen: true, existing: null })).toBe("CREATE");
  });

  it("is a no-op for someone already enrolled, even if the course is closed or archived", () => {
    expect(decideEnrollment({ courseStatus: "PUBLISHED", enrollmentOpen: false, existing: "ACTIVE" })).toBe("NOOP");
    expect(decideEnrollment({ courseStatus: "ARCHIVED", enrollmentOpen: true, existing: "ACTIVE" })).toBe("NOOP");
  });

  it("reactivates a withdrawn enrollment while the course is open", () => {
    expect(decideEnrollment({ courseStatus: "PUBLISHED", enrollmentOpen: true, existing: "WITHDRAWN" })).toBe("REACTIVATE");
  });

  it("hides draft courses", () => {
    expect(codeOf(() => decideEnrollment({ courseStatus: "DRAFT", enrollmentOpen: true, existing: null }))).toBe("NOT_FOUND");
  });

  it("rejects new enrollments when closed or archived", () => {
    expect(codeOf(() => decideEnrollment({ courseStatus: "PUBLISHED", enrollmentOpen: false, existing: null }))).toBe("ENROLLMENT_CLOSED");
    expect(codeOf(() => decideEnrollment({ courseStatus: "ARCHIVED", enrollmentOpen: true, existing: null }))).toBe("ENROLLMENT_CLOSED");
  });

  it("rejects re-enrollment after withdrawal when closed or archived", () => {
    expect(codeOf(() => decideEnrollment({ courseStatus: "PUBLISHED", enrollmentOpen: false, existing: "WITHDRAWN" }))).toBe("ENROLLMENT_CLOSED");
    expect(codeOf(() => decideEnrollment({ courseStatus: "ARCHIVED", enrollmentOpen: true, existing: "WITHDRAWN" }))).toBe("ENROLLMENT_CLOSED");
  });
});
