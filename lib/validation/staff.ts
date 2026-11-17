// lib/validation/staff.ts
// Request schemas for the staff API. `.strict()` everywhere: unknown fields are rejected,
// so a client can never write a column it was not meant to touch.
// For PATCH-style schemas, `undefined` means "leave as is" and null/"" means "clear".

import { z } from "zod";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const nonEmpty = (v: object) => Object.keys(v).length > 0;
const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const visibility = z.enum(["PUBLIC", "SIGNED_IN", "ENROLLED"]);
const publishStatus = z.enum(["DRAFT", "PUBLISHED"]);

// ------------------------------------------------------------------ courses
const courseFields = {
  slug: z.string().trim().min(3).max(80),
  titleAr: z.string().trim().min(2).max(200),
  titleEn: text(200).nullish(),
  shortDescAr: text(500).nullish(),
  shortDescEn: text(500).nullish(),
  descriptionAr: text(20_000).nullish(),
  descriptionEn: text(20_000).nullish(),
  coverImagePath: text(500).nullish(),
  language: z.string().trim().min(2).max(10),
  targetAudienceAr: text(2_000).nullish(),
  targetAudienceEn: text(2_000).nullish(),
  prerequisitesAr: text(2_000).nullish(),
  prerequisitesEn: text(2_000).nullish(),
  formatAr: text(1_000).nullish(),
  formatEn: text(1_000).nullish(),
  lectureFrequencyAr: text(500).nullish(),
  lectureFrequencyEn: text(500).nullish(),
  enrollmentOpen: z.boolean(),
  attendanceEnabled: z.boolean(),
  questionsEnabled: z.boolean(),
  examEnabled: z.boolean(),
  certificateEnabled: z.boolean(),
  recordingsEnabled: z.boolean(),
};

export const createCourseSchema = z
  .object({ ...courseFields, language: courseFields.language.optional() })
  .partial({
    enrollmentOpen: true, attendanceEnabled: true, questionsEnabled: true,
    examEnabled: true, certificateEnabled: true, recordingsEnabled: true,
  })
  .extend({ instructorIds: z.array(uuid).max(20).optional() })
  .strict();

export const updateCourseSchema = z.object(courseFields).partial().strict().refine(nonEmpty, {
  message: "No fields to update",
});

export const courseSettingsSchema = z
  .object({
    partialWeight: z.number().min(0).max(1),
    allowLateSubmissions: z.boolean(),
    defaultPenaltyType: z.enum(["NONE", "PERCENT", "POINTS"]),
    defaultPenaltyValue: z.number().min(0).max(9999.99),
    answerRevealMode: z.enum(["AFTER_GRADE_AND_DEADLINE", "AFTER_GRADE", "NEVER"]),
    recordingsVisibility: visibility,
    materialsVisibility: visibility,
  })
  .partial()
  .strict()
  .refine(nonEmpty, { message: "No fields to update" });

export const courseContentSchema = z
  .object({
    objectives: z
      .array(z.object({ textAr: z.string().trim().min(1).max(500), textEn: text(500).nullish() }).strict())
      .max(30),
    faqs: z
      .array(
        z
          .object({
            questionAr: z.string().trim().min(1).max(500),
            questionEn: text(500).nullish(),
            answerAr: z.string().trim().min(1).max(5_000),
            answerEn: text(5_000).nullish(),
          })
          .strict(),
      )
      .max(50),
  })
  .partial()
  .strict()
  .refine(nonEmpty, { message: "Send objectives, faqs, or both" });

export const courseInstructorsSchema = z.object({ userIds: z.array(uuid).max(20) }).strict();

export const courseStatusSchema = z
  .object({ action: z.enum(["publish", "unpublish", "archive", "unarchive"]) })
  .strict();

// ------------------------------------------------------------------ lectures
const lectureFields = {
  number: z.number().int().min(1).max(10_000),
  titleAr: z.string().trim().min(2).max(200),
  titleEn: text(200).nullish(),
  descriptionAr: text(5_000).nullish(),
  descriptionEn: text(5_000).nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().trim().min(1).max(64).refine(validTimezone, { message: "Unknown timezone" }),
  zoomUrl: text(2_048).nullish(),
  zoomMeetingId: text(100).nullish(),
  zoomPassword: text(100).nullish(),
  status: publishStatus,
};

export const createLectureSchema = z
  .object(lectureFields)
  .partial({ number: true, titleEn: true, timezone: true, status: true })
  .strict()
  .refine((v) => v.endsAt.getTime() > v.startsAt.getTime(), { message: "endsAt must be after startsAt" });

export const updateLectureSchema = z.object(lectureFields).partial().strict().refine(nonEmpty, {
  message: "No fields to update",
});

// ------------------------------------------------------------------ recordings and materials
const provider = z.enum(["GOOGLE_DRIVE", "ONEDRIVE", "YOUTUBE", "OTHER"]);

export const createRecordingSchema = z
  .object({
    provider,
    url: z.string().trim().min(1).max(2_048),
    titleAr: text(200).nullish(),
    titleEn: text(200).nullish(),
    durationSeconds: z.number().int().min(0).max(86_400).nullish(),
    position: z.number().int().min(0).max(1_000).optional(),
    visibility: visibility.optional(),
    status: publishStatus.optional(),
  })
  .strict();

export const updateRecordingSchema = createRecordingSchema.partial().strict().refine(nonEmpty, {
  message: "No fields to update",
});

export const createMaterialSchema = z
  .object({
    lectureId: uuid.nullish(),
    titleAr: z.string().trim().min(1).max(200),
    titleEn: text(200).nullish(),
    type: z.enum(["PDF", "DOC", "OTHER"]),
    storagePath: text(300).nullish(),
    externalUrl: text(2_048).nullish(),
    visibility: visibility.optional(),
    status: publishStatus.optional(),
    position: z.number().int().min(0).max(1_000).optional(),
  })
  .strict();

export const updateMaterialSchema = createMaterialSchema
  .omit({ lectureId: true })
  .partial()
  .strict()
  .refine(nonEmpty, { message: "No fields to update" });

// ------------------------------------------------------------------ attendance and students
export const saveAttendanceSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            userId: uuid,
            status: z.enum(["PRESENT", "PARTIAL", "ABSENT", "EXCUSED"]).nullable(),
            minutesAttended: z.number().int().min(0).max(1440).nullish(),
            note: text(500).nullish(),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .strict();

export const staffEnrollSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254) })
  .strict();

export const staffSetEnrollmentSchema = z
  .object({ status: z.enum(["ACTIVE", "WITHDRAWN"]) })
  .strict();

// ------------------------------------------------------------------ questions and exams
const optionInput = z
  .object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean() })
  .strict();

const questionFields = {
  body: z.string().trim().min(1).max(10_000),
  points: z.number().min(0.01).max(1000),
  explanation: text(5_000).nullish(),
  position: z.number().int().min(0).max(1_000),
  status: publishStatus,
  options: z.array(optionInput).max(10),
  /** TRUE_FALSE only */
  correctAnswer: z.boolean(),
  /** Lecture questions only */
  dueAt: z.coerce.date().nullish(),
  lateCutoffAt: z.coerce.date().nullish(),
  allowLate: z.boolean().nullish(),
};

export const createQuestionSchema = z
  .object({ type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN"]), ...questionFields })
  .partial({ position: true, status: true, options: true, correctAnswer: true })
  .strict();

/** The type cannot change after creation: delete and recreate instead. */
export const updateQuestionSchema = z.object(questionFields).partial().strict().refine(nonEmpty, {
  message: "No fields to update",
});

export const createExamSchema = z
  .object({
    titleAr: z.string().trim().min(2).max(200),
    titleEn: text(200).nullish(),
    descriptionAr: text(5_000).nullish(),
    descriptionEn: text(5_000).nullish(),
    opensAt: z.coerce.date().nullish(),
    dueAt: z.coerce.date().nullish(),
    passingPercent: z.number().min(0).max(100).optional(),
    attemptLimit: z.number().int().min(1).max(10).optional(),
  })
  .strict()
  .refine((v) => !v.opensAt || !v.dueAt || v.dueAt.getTime() > v.opensAt.getTime(), {
    message: "dueAt must be after opensAt",
  });

export const updateExamSchema = z
  .object({
    titleAr: z.string().trim().min(2).max(200),
    titleEn: text(200).nullish(),
    descriptionAr: text(5_000).nullish(),
    descriptionEn: text(5_000).nullish(),
    opensAt: z.coerce.date().nullish(),
    dueAt: z.coerce.date().nullish(),
    passingPercent: z.number().min(0).max(100),
    attemptLimit: z.number().int().min(1).max(10),
    status: publishStatus,
  })
  .partial()
  .strict()
  .refine(nonEmpty, { message: "No fields to update" });

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

/** Ask for a signed upload URL. The server checks the type and size against its allowlist. */
export const uploadRequestSchema = z
  .object({ contentType: z.string().trim().min(1).max(200), size: z.number().int().positive() })
  .strict();

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CourseSettingsInput = z.infer<typeof courseSettingsSchema>;
export type CourseContentInput = z.infer<typeof courseContentSchema>;
export type CreateLectureInput = z.infer<typeof createLectureSchema>;
export type UpdateLectureInput = z.infer<typeof updateLectureSchema>;
export type CreateRecordingInput = z.infer<typeof createRecordingSchema>;
export type UpdateRecordingInput = z.infer<typeof updateRecordingSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
