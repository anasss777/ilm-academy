-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'PARTIAL', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'IMPORT', 'ZOOM');

-- CreateEnum
CREATE TYPE "RecordingProvider" AS ENUM ('GOOGLE_DRIVE', 'ONEDRIVE', 'YOUTUBE', 'OTHER');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'SIGNED_IN', 'ENROLLED');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PDF', 'DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'OPEN');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('NONE', 'PERCENT', 'POINTS');

-- CreateEnum
CREATE TYPE "AnswerRevealMode" AS ENUM ('AFTER_GRADE_AND_DEADLINE', 'AFTER_GRADE', 'NEVER');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('PENDING', 'AUTO_ELIGIBLE', 'AUTO_INELIGIBLE', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "avatarPath" TEXT,
    "bioAr" TEXT,
    "bioEn" TEXT,
    "telegramUsername" TEXT,
    "telegramChatId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "dataSharingConsentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "courseId" UUID,
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "slug" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "shortDescAr" TEXT,
    "shortDescEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "coverImagePath" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "enrollmentOpen" BOOLEAN NOT NULL DEFAULT true,
    "targetAudienceAr" TEXT,
    "targetAudienceEn" TEXT,
    "prerequisitesAr" TEXT,
    "prerequisitesEn" TEXT,
    "formatAr" TEXT,
    "formatEn" TEXT,
    "lectureFrequencyAr" TEXT,
    "lectureFrequencyEn" TEXT,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "questionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "examEnabled" BOOLEAN NOT NULL DEFAULT false,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recordingsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_settings" (
    "courseId" UUID NOT NULL,
    "partialWeight" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT true,
    "defaultPenaltyType" "PenaltyType" NOT NULL DEFAULT 'NONE',
    "defaultPenaltyValue" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "answerRevealMode" "AnswerRevealMode" NOT NULL DEFAULT 'AFTER_GRADE_AND_DEADLINE',
    "recordingsVisibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "materialsVisibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',

    CONSTRAINT "course_settings_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "course_instructors" (
    "courseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_instructors_pkey" PRIMARY KEY ("courseId","userId")
);

-- CreateTable
CREATE TABLE "course_objectives" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_faqs" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "questionAr" TEXT NOT NULL,
    "questionEn" TEXT,
    "answerAr" TEXT NOT NULL,
    "answerEn" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(6),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectures" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "zoomUrl" TEXT,
    "zoomMeetingId" TEXT,
    "zoomPassword" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "lectures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL,
    "lectureId" UUID NOT NULL,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "provider" "RecordingProvider" NOT NULL,
    "url" TEXT NOT NULL,
    "embedUrl" TEXT,
    "durationSeconds" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "lectureId" UUID,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "type" "MaterialType" NOT NULL,
    "storagePath" TEXT,
    "externalUrl" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "lectureId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "minutesAttended" INTEGER,
    "joinedAt" TIMESTAMPTZ(6),
    "leftAt" TIMESTAMPTZ(6),
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "opensAt" TIMESTAMPTZ(6),
    "dueAt" TIMESTAMPTZ(6),
    "passingPercent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "attemptLimit" INTEGER NOT NULL DEFAULT 1,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "lectureId" UUID,
    "examId" UUID,
    "type" "QuestionType" NOT NULL,
    "body" TEXT NOT NULL,
    "explanation" TEXT,
    "points" DECIMAL(7,2) NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "dueAt" TIMESTAMPTZ(6),
    "lateCutoffAt" TIMESTAMPTZ(6),
    "allowLate" BOOLEAN,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_submissions" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "answerText" TEXT,
    "selectedOptionId" UUID,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "excuseGranted" BOOLEAN NOT NULL DEFAULT false,
    "excuseReason" TEXT,
    "excuseGrantedById" UUID,
    "excuseGrantedAt" TIMESTAMPTZ(6),
    "rawScore" DECIMAL(7,2),
    "penaltyType" "PenaltyType" NOT NULL DEFAULT 'NONE',
    "penaltyValue" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "finalScore" DECIMAL(7,2),
    "feedback" TEXT,
    "gradedById" UUID,
    "gradedAt" TIMESTAMPTZ(6),
    "releasedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_extensions" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "newDueAt" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "grantedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(6),
    "gradedAt" TIMESTAMPTZ(6),
    "releasedAt" TIMESTAMPTZ(6),
    "totalScore" DECIMAL(8,2),

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answerText" TEXT,
    "selectedOptionId" UUID,
    "isCorrect" BOOLEAN,
    "score" DECIMAL(7,2),
    "feedback" TEXT,
    "gradedById" UUID,
    "gradedAt" TIMESTAMPTZ(6),

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempt_grants" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "extraAttempts" INTEGER NOT NULL DEFAULT 1,
    "newDueAt" TIMESTAMPTZ(6),
    "reason" TEXT,
    "grantedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_attempt_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_requirements" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "minAttendancePercent" DECIMAL(5,2),
    "minQuestionScorePercent" DECIMAL(5,2),
    "minExamPercent" DECIMAL(5,2),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_reviews" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'PENDING',
    "requirementVersion" INTEGER,
    "needsReReview" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "certificate_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_exports" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "exportedById" UUID NOT NULL,
    "requirementVersion" INTEGER NOT NULL,
    "rulesSnapshot" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "exportedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_export_items" (
    "id" UUID NOT NULL,
    "exportId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "totalLectures" INTEGER NOT NULL,
    "attendedLectures" DECIMAL(6,2) NOT NULL,
    "requiredLectures" INTEGER,
    "attendancePercent" DECIMAL(5,2),
    "questionScorePercent" DECIMAL(5,2),
    "examPercent" DECIMAL(5,2),

    CONSTRAINT "certificate_export_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_key_key" ON "roles"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_courseId_key" ON "user_roles"("userId", "roleId", "courseId");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_slug_key" ON "courses"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "course_objectives_courseId_position_idx" ON "course_objectives"("courseId", "position");

-- CreateIndex
CREATE INDEX "course_faqs_courseId_position_idx" ON "course_faqs"("courseId", "position");

-- CreateIndex
CREATE INDEX "enrollments_courseId_status_idx" ON "enrollments"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- CreateIndex
CREATE INDEX "lectures_courseId_startsAt_idx" ON "lectures"("courseId", "startsAt");

-- CreateIndex
CREATE INDEX "recordings_lectureId_position_idx" ON "recordings"("lectureId", "position");

-- CreateIndex
CREATE INDEX "materials_courseId_lectureId_idx" ON "materials"("courseId", "lectureId");

-- CreateIndex
CREATE INDEX "attendance_records_courseId_userId_idx" ON "attendance_records"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_lectureId_userId_key" ON "attendance_records"("lectureId", "userId");

-- CreateIndex
CREATE INDEX "exams_courseId_idx" ON "exams"("courseId");

-- CreateIndex
CREATE INDEX "questions_lectureId_idx" ON "questions"("lectureId");

-- CreateIndex
CREATE INDEX "questions_examId_position_idx" ON "questions"("examId", "position");

-- CreateIndex
CREATE INDEX "questions_courseId_idx" ON "questions"("courseId");

-- CreateIndex
CREATE INDEX "question_options_questionId_position_idx" ON "question_options"("questionId", "position");

-- CreateIndex
CREATE INDEX "question_submissions_userId_idx" ON "question_submissions"("userId");

-- CreateIndex
CREATE INDEX "question_submissions_questionId_gradedAt_idx" ON "question_submissions"("questionId", "gradedAt");

-- CreateIndex
CREATE UNIQUE INDEX "question_submissions_questionId_userId_key" ON "question_submissions"("questionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "deadline_extensions_questionId_userId_key" ON "deadline_extensions"("questionId", "userId");

-- CreateIndex
CREATE INDEX "exam_attempts_examId_status_idx" ON "exam_attempts"("examId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_examId_userId_attemptNumber_key" ON "exam_attempts"("examId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attemptId_questionId_key" ON "exam_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "exam_attempt_grants_examId_userId_idx" ON "exam_attempt_grants"("examId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_requirements_courseId_version_key" ON "certificate_requirements"("courseId", "version");

-- CreateIndex
CREATE INDEX "certificate_reviews_courseId_status_idx" ON "certificate_reviews"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_reviews_courseId_userId_key" ON "certificate_reviews"("courseId", "userId");

-- CreateIndex
CREATE INDEX "certificate_exports_courseId_exportedAt_idx" ON "certificate_exports"("courseId", "exportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_export_items_exportId_userId_key" ON "certificate_export_items"("exportId", "userId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_settings" ADD CONSTRAINT "course_settings_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_objectives" ADD CONSTRAINT "course_objectives_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_faqs" ADD CONSTRAINT "course_faqs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_submissions" ADD CONSTRAINT "question_submissions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_submissions" ADD CONSTRAINT "question_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_submissions" ADD CONSTRAINT "question_submissions_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_submissions" ADD CONSTRAINT "question_submissions_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_submissions" ADD CONSTRAINT "question_submissions_excuseGrantedById_fkey" FOREIGN KEY ("excuseGrantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_grants" ADD CONSTRAINT "exam_attempt_grants_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_grants" ADD CONSTRAINT "exam_attempt_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_grants" ADD CONSTRAINT "exam_attempt_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_requirements" ADD CONSTRAINT "certificate_requirements_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_requirements" ADD CONSTRAINT "certificate_requirements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_reviews" ADD CONSTRAINT "certificate_reviews_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_reviews" ADD CONSTRAINT "certificate_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_reviews" ADD CONSTRAINT "certificate_reviews_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_exports" ADD CONSTRAINT "certificate_exports_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_exports" ADD CONSTRAINT "certificate_exports_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_export_items" ADD CONSTRAINT "certificate_export_items_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "certificate_exports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_export_items" ADD CONSTRAINT "certificate_export_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- post_init.sql: constraints Prisma cannot express.
-- Apply by creating an empty migration after the first `prisma migrate dev`:
--   npx prisma migrate dev --create-only --name post_init
-- then paste this file into the generated migration.sql and run `prisma migrate dev`.
-- Column names are camelCase, so they are quoted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Seed row required by the organizationId defaults
-- ---------------------------------------------------------------------------
INSERT INTO "organizations" ("id", "slug", "name")
VALUES ('00000000-0000-0000-0000-000000000001', 'general', 'General')
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Link users.id to Supabase auth.users.id
--    Guarded because the auth schema does not exist in Prisma's shadow database.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_id_auth_fk"
      FOREIGN KEY ("id") REFERENCES auth.users ("id");
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Partial unique indexes
-- ---------------------------------------------------------------------------

-- Lecture numbers are unique per course among non-deleted lectures
CREATE UNIQUE INDEX "lectures_course_number_active_key"
  ON "lectures" ("courseId", "number")
  WHERE "deletedAt" IS NULL;

-- Exactly one current certificate requirement per course
CREATE UNIQUE INDEX "certificate_requirements_one_current_key"
  ON "certificate_requirements" ("courseId")
  WHERE "isCurrent" = true;

-- Org-wide role assignments (courseId IS NULL) must also be unique,
-- because NULLs are distinct in the composite unique constraint
CREATE UNIQUE INDEX "user_roles_org_wide_key"
  ON "user_roles" ("userId", "roleId")
  WHERE "courseId" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. CHECK constraints
-- ---------------------------------------------------------------------------

-- A question belongs to exactly one parent: a lecture OR an exam
ALTER TABLE "questions" ADD CONSTRAINT "questions_one_parent_chk"
  CHECK ((("lectureId" IS NOT NULL)::int + ("examId" IS NOT NULL)::int) = 1);

ALTER TABLE "questions" ADD CONSTRAINT "questions_points_chk"
  CHECK ("points" > 0);

-- Only lecture questions carry deadlines
ALTER TABLE "questions" ADD CONSTRAINT "questions_deadline_lecture_only_chk"
  CHECK ("examId" IS NULL OR ("dueAt" IS NULL AND "lateCutoffAt" IS NULL AND "allowLate" IS NULL));

ALTER TABLE "questions" ADD CONSTRAINT "questions_cutoff_after_due_chk"
  CHECK ("lateCutoffAt" IS NULL OR "dueAt" IS NULL OR "lateCutoffAt" >= "dueAt");

ALTER TABLE "lectures" ADD CONSTRAINT "lectures_time_order_chk"
  CHECK ("endsAt" > "startsAt");

ALTER TABLE "exams" ADD CONSTRAINT "exams_window_chk"
  CHECK ("opensAt" IS NULL OR "dueAt" IS NULL OR "dueAt" > "opensAt");
ALTER TABLE "exams" ADD CONSTRAINT "exams_attempt_limit_chk"
  CHECK ("attemptLimit" >= 1);
ALTER TABLE "exams" ADD CONSTRAINT "exams_passing_pct_chk"
  CHECK ("passingPercent" BETWEEN 0 AND 100);

ALTER TABLE "course_settings" ADD CONSTRAINT "course_settings_partial_weight_chk"
  CHECK ("partialWeight" BETWEEN 0 AND 1);
ALTER TABLE "course_settings" ADD CONSTRAINT "course_settings_penalty_chk"
  CHECK ("defaultPenaltyValue" >= 0);

ALTER TABLE "question_submissions" ADD CONSTRAINT "submissions_scores_chk"
  CHECK (
    ("rawScore"   IS NULL OR "rawScore"   >= 0) AND
    ("finalScore" IS NULL OR "finalScore" >= 0) AND
    ("penaltyValue" >= 0) AND
    ("finalScore" IS NULL OR "rawScore" IS NULL OR "finalScore" <= "rawScore")
  );
ALTER TABLE "question_submissions" ADD CONSTRAINT "submissions_has_answer_chk"
  CHECK ("answerText" IS NOT NULL OR "selectedOptionId" IS NOT NULL);

ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_score_chk"
  CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_number_chk"
  CHECK ("attemptNumber" >= 1);
ALTER TABLE "exam_attempt_grants" ADD CONSTRAINT "exam_attempt_grants_extra_chk"
  CHECK ("extraAttempts" >= 0);

ALTER TABLE "certificate_requirements" ADD CONSTRAINT "cert_req_percent_chk"
  CHECK (
    ("minAttendancePercent"    IS NULL OR "minAttendancePercent"    BETWEEN 0 AND 100) AND
    ("minQuestionScorePercent" IS NULL OR "minQuestionScorePercent" BETWEEN 0 AND 100) AND
    ("minExamPercent"          IS NULL OR "minExamPercent"          BETWEEN 0 AND 100)
  );

-- Material must point somewhere
ALTER TABLE "materials" ADD CONSTRAINT "materials_source_chk"
  CHECK ("storagePath" IS NOT NULL OR "externalUrl" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security: deny-by-default for the Supabase anon / authenticated keys.
--    Prisma connects with a privileged role and bypasses RLS, so server-side
--    authorization remains the real gatekeeper. This is defense in depth.
--    No policies are created on purpose.
--    Re-run this block whenever you add new tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;