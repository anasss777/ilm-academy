// lib/staff/rules.ts
// Pure rules for the staff management API. No database, no Date.now().

import { GradingError } from "../grading/grading";

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Letters (Arabic included), digits and single hyphens: "intro-to-fiqh", "مدخل-إلى-الفقه". */
export const SLUG_REGEX = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export function assertValidSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (s.length < 3 || s.length > 80 || !SLUG_REGEX.test(s)) throw new GradingError("INVALID_SLUG");
  return s;
}

// ---------------------------------------------------------------------------
// Course status
// ---------------------------------------------------------------------------

export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type CourseAction = "publish" | "unpublish" | "archive" | "unarchive";

/**
 * DRAFT -> PUBLISHED -> ARCHIVED -> PUBLISHED.
 * A course with active students cannot go back to DRAFT (it would vanish from under them):
 * archive it instead.
 */
export function nextCourseStatus(args: {
  from: CourseStatus;
  action: CourseAction;
  activeEnrollments: number;
}): CourseStatus {
  const { from, action, activeEnrollments } = args;
  switch (action) {
    case "publish":
      if (from === "DRAFT") return "PUBLISHED";
      break;
    case "unpublish":
      if (from === "PUBLISHED" && activeEnrollments === 0) return "DRAFT";
      if (from === "PUBLISHED") {
        throw new GradingError(
          "INVALID_STATUS_TRANSITION",
          "A course with enrolled students cannot be unpublished; archive it instead",
        );
      }
      break;
    case "archive":
      if (from === "PUBLISHED") return "ARCHIVED";
      break;
    case "unarchive":
      if (from === "ARCHIVED") return "PUBLISHED";
      break;
  }
  throw new GradingError("INVALID_STATUS_TRANSITION", `Cannot ${action} a ${from} course`);
}

/** What is still missing before a course may be shown to the public. Empty = ready. */
export function publishReadiness(c: {
  titleAr: string;
  shortDescAr: string | null;
  descriptionAr: string | null;
  certificateEnabled: boolean;
  instructorCount: number;
  hasCertificateRequirement: boolean;
}): string[] {
  const missing: string[] = [];
  if (!c.titleAr.trim()) missing.push("titleAr");
  if (!c.shortDescAr?.trim()) missing.push("shortDescAr");
  if (!c.descriptionAr?.trim()) missing.push("descriptionAr");
  if (c.instructorCount === 0) missing.push("instructor");
  // Without thresholds nobody could ever become eligible
  if (c.certificateEnabled && !c.hasCertificateRequirement) missing.push("certificateRequirement");
  return missing;
}

// ---------------------------------------------------------------------------
// External links: recordings, materials, zoom
// ---------------------------------------------------------------------------

export type RecordingProvider = "GOOGLE_DRIVE" | "ONEDRIVE" | "YOUTUBE" | "OTHER";

const HOST_RULES: Record<RecordingProvider, (host: string) => boolean> = {
  YOUTUBE: (h) =>
    ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(h),
  GOOGLE_DRIVE: (h) => ["drive.google.com", "docs.google.com"].includes(h),
  ONEDRIVE: (h) => ["onedrive.live.com", "1drv.ms"].includes(h) || h.endsWith(".sharepoint.com"),
  OTHER: () => true,
};

/**
 * Students will click (and sometimes see embedded) whatever is stored here, so it must be
 * https, carry no credentials, and, for known providers, point at that provider's own hosts.
 * Returns the normalized URL.
 */
export function validateExternalUrl(provider: RecordingProvider, raw: string): string {
  if (raw.length > 2048) throw new GradingError("INVALID_URL", "URL is too long");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new GradingError("INVALID_URL", "Not a valid URL");
  }
  if (url.protocol !== "https:") throw new GradingError("INVALID_URL", "Only https links are allowed");
  if (url.username || url.password) throw new GradingError("INVALID_URL", "Links must not contain credentials");
  const host = url.hostname.toLowerCase();
  if (!HOST_RULES[provider](host)) {
    throw new GradingError("INVALID_URL", `${host} is not a ${provider} address`);
  }
  return url.toString();
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * An embeddable URL, or null when the link should be shown as a plain link. Only YouTube and
 * Google Drive are embedded, and only after the id is extracted and checked, so the stored
 * value can never smuggle an arbitrary page into an iframe.
 */
export function deriveEmbedUrl(provider: RecordingProvider, validatedUrl: string): string | null {
  const url = new URL(validatedUrl);

  if (provider === "YOUTUBE") {
    let id: string | null = null;
    if (url.hostname.toLowerCase() === "youtu.be") {
      id = url.pathname.slice(1).split("/")[0] || null;
    } else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "watch") id = url.searchParams.get("v");
      else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    }
    return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (provider === "GOOGLE_DRIVE" && url.hostname.toLowerCase() === "drive.google.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    let id: string | null = null;
    if (parts[0] === "file" && parts[1] === "d") id = parts[2] ?? null;
    else if (parts[0] === "open") id = url.searchParams.get("id");
    return id && DRIVE_ID.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null;
  }

  return null; // OneDrive, SharePoint and others: plain link
}

/** Supabase Storage object path: no traversal, no absolute paths, no odd characters. */
export function isSafeStoragePath(path: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,299}$/.test(path) && !path.includes("..") && !path.includes("//")
  );
}

// ---------------------------------------------------------------------------
// Attendance entry
// ---------------------------------------------------------------------------

export type AttendanceStatus = "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED";

export interface AttendanceEntryInput {
  userId: string;
  /** null = clear the record (back to "not recorded") */
  status: AttendanceStatus | null;
  minutesAttended?: number | null;
  note?: string | null;
}

export const MAX_ATTENDANCE_ENTRIES = 2000;

export function validateAttendanceEntries(
  entries: AttendanceEntryInput[],
  activeStudentIds: Set<string>,
): void {
  if (entries.length === 0 || entries.length > MAX_ATTENDANCE_ENTRIES) {
    throw new GradingError("INVALID_ATTENDANCE", `Send between 1 and ${MAX_ATTENDANCE_ENTRIES} entries`);
  }
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.userId)) throw new GradingError("INVALID_ATTENDANCE", `Duplicate entry for ${e.userId}`);
    seen.add(e.userId);
    if (!activeStudentIds.has(e.userId)) {
      throw new GradingError("INVALID_ATTENDANCE", `${e.userId} is not an active student of this course`);
    }
    if (e.minutesAttended != null && (!Number.isInteger(e.minutesAttended) || e.minutesAttended < 0 || e.minutesAttended > 1440)) {
      throw new GradingError("INVALID_ATTENDANCE", "minutesAttended must be a whole number from 0 to 1440");
    }
  }
}
