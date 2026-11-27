-- AlterTable
ALTER TABLE "courses" ALTER COLUMN "organizationId" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN     "expiresAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "organizationId" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "organizationId" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- CreateIndex
CREATE INDEX "exam_attempts_status_expiresAt_idx" ON "exam_attempts"("status", "expiresAt");


ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_duration_range;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_duration_range CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 600);