-- notifications_triggers.sql
-- Append this to the migration that Prisma generates for the Notification / User changes
-- (npx prisma migrate dev --create-only --name notifications), then apply it.
--
-- Event-driven notifications are created by the database itself, in the same transaction as the
-- change that causes them. That way no code path (staff screen, API, script) can forget to
-- notify, and nothing is notified if the change rolls back. Time-based reminders (a lecture
-- starting soon, a deadline approaching) are created by the scheduled job instead.
--
-- "dedupeKey" is unique, so every trigger is safe to run twice: ON CONFLICT DO NOTHING.
-- Idempotent: safe to run again.

-- ---------------------------------------------------------------------------
-- Helper: notify every ACTIVE student of a course
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_course_students(
  p_course uuid, p_type text, p_payload jsonb, p_key text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications ("id", "userId", "type", "payload", "dedupeKey")
  SELECT gen_random_uuid(), e."userId", p_type, p_payload, p_key || ':' || e."userId"::text
  FROM public.enrollments e
  JOIN public.users u ON u."id" = e."userId"
  WHERE e."courseId" = p_course
    AND e."status" = 'ACTIVE'
    AND u."status" = 'ACTIVE'
    AND u."deletedAt" IS NULL
  ON CONFLICT ("dedupeKey") DO NOTHING;
$$;

-- ---------------------------------------------------------------------------
-- A lecture-question grade becomes visible to the student (manual grading only:
-- objective questions are graded and shown at submission, which needs no notification)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_question_graded() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."gradedById" IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications ("id", "userId", "type", "payload", "dedupeKey")
  SELECT gen_random_uuid(), NEW."userId", 'question.graded',
         jsonb_build_object('courseId', q."courseId", 'lectureId', q."lectureId", 'questionId', q."id"),
         'question.graded:' || NEW."id"::text || ':'
           || floor(extract(epoch FROM COALESCE(NEW."gradedAt", NEW."releasedAt")))::bigint::text
  FROM public.questions q
  WHERE q."id" = NEW."questionId" AND q."lectureId" IS NOT NULL
  ON CONFLICT ("dedupeKey") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_question_graded ON public.question_submissions;
CREATE TRIGGER notify_question_graded
  AFTER UPDATE ON public.question_submissions
  FOR EACH ROW
  WHEN (OLD."releasedAt" IS NULL AND NEW."releasedAt" IS NOT NULL)
  EXECUTE FUNCTION public.notify_question_graded();

-- ---------------------------------------------------------------------------
-- Exam results released after grading (not when the student's own submit auto-grades it)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_exam_results() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD."status" = 'IN_PROGRESS' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications ("id", "userId", "type", "payload", "dedupeKey")
  SELECT gen_random_uuid(), NEW."userId", 'exam.results_released',
         jsonb_build_object('courseId', x."courseId", 'examId', x."id", 'attemptId', NEW."id"),
         'exam.results_released:' || NEW."id"::text
  FROM public.exams x
  WHERE x."id" = NEW."examId"
  ON CONFLICT ("dedupeKey") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_exam_results ON public.exam_attempts;
CREATE TRIGGER notify_exam_results
  AFTER UPDATE ON public.exam_attempts
  FOR EACH ROW
  WHEN (OLD."releasedAt" IS NULL AND NEW."releasedAt" IS NOT NULL)
  EXECUTE FUNCTION public.notify_exam_results();

-- ---------------------------------------------------------------------------
-- Certificate request approved
-- (two triggers, because OLD does not exist on INSERT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_certificate_approved() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications ("id", "userId", "type", "payload", "dedupeKey")
  VALUES (gen_random_uuid(), NEW."userId", 'certificate.approved',
          jsonb_build_object('courseId', NEW."courseId"),
          'certificate.approved:' || NEW."id"::text)
  ON CONFLICT ("dedupeKey") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_certificate_approved_ins ON public.certificate_reviews;
CREATE TRIGGER notify_certificate_approved_ins
  AFTER INSERT ON public.certificate_reviews
  FOR EACH ROW
  WHEN (NEW."status" = 'APPROVED')
  EXECUTE FUNCTION public.notify_certificate_approved();

DROP TRIGGER IF EXISTS notify_certificate_approved_upd ON public.certificate_reviews;
CREATE TRIGGER notify_certificate_approved_upd
  AFTER UPDATE ON public.certificate_reviews
  FOR EACH ROW
  WHEN (NEW."status" = 'APPROVED' AND OLD."status" <> 'APPROVED')
  EXECUTE FUNCTION public.notify_certificate_approved();

-- ---------------------------------------------------------------------------
-- A recording is published
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_recording_added() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid;
BEGIN
  SELECT l."courseId" INTO v_course
  FROM public.lectures l
  JOIN public.courses c ON c."id" = l."courseId"
  WHERE l."id" = NEW."lectureId"
    AND l."status" = 'PUBLISHED' AND l."deletedAt" IS NULL
    AND c."status" = 'PUBLISHED' AND c."recordingsEnabled";
  IF v_course IS NOT NULL THEN
    PERFORM public.notify_course_students(
      v_course, 'recording.added',
      jsonb_build_object('courseId', v_course, 'lectureId', NEW."lectureId", 'recordingId', NEW."id"),
      'recording.added:' || NEW."id"::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_recording_added_ins ON public.recordings;
CREATE TRIGGER notify_recording_added_ins
  AFTER INSERT ON public.recordings
  FOR EACH ROW
  WHEN (NEW."status" = 'PUBLISHED')
  EXECUTE FUNCTION public.notify_recording_added();

DROP TRIGGER IF EXISTS notify_recording_added_upd ON public.recordings;
CREATE TRIGGER notify_recording_added_upd
  AFTER UPDATE ON public.recordings
  FOR EACH ROW
  WHEN (NEW."status" = 'PUBLISHED' AND OLD."status" <> 'PUBLISHED')
  EXECUTE FUNCTION public.notify_recording_added();

-- ---------------------------------------------------------------------------
-- A lecture question is published
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_question_published() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid;
BEGIN
  IF NEW."lectureId" IS NULL OR NEW."deletedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT l."courseId" INTO v_course
  FROM public.lectures l
  JOIN public.courses c ON c."id" = l."courseId"
  WHERE l."id" = NEW."lectureId"
    AND l."status" = 'PUBLISHED' AND l."deletedAt" IS NULL
    AND c."status" = 'PUBLISHED' AND c."questionsEnabled";
  IF v_course IS NOT NULL THEN
    PERFORM public.notify_course_students(
      v_course, 'question.published',
      jsonb_build_object('courseId', v_course, 'lectureId', NEW."lectureId", 'questionId', NEW."id"),
      'question.published:' || NEW."id"::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_question_published_ins ON public.questions;
CREATE TRIGGER notify_question_published_ins
  AFTER INSERT ON public.questions
  FOR EACH ROW
  WHEN (NEW."status" = 'PUBLISHED')
  EXECUTE FUNCTION public.notify_question_published();

DROP TRIGGER IF EXISTS notify_question_published_upd ON public.questions;
CREATE TRIGGER notify_question_published_upd
  AFTER UPDATE ON public.questions
  FOR EACH ROW
  WHEN (NEW."status" = 'PUBLISHED' AND OLD."status" <> 'PUBLISHED')
  EXECUTE FUNCTION public.notify_question_published();

-- ---------------------------------------------------------------------------
-- The exam is published
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_exam_published() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW."deletedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT TRUE INTO v_ok FROM public.courses c
  WHERE c."id" = NEW."courseId" AND c."status" = 'PUBLISHED' AND c."examEnabled";
  IF v_ok THEN
    PERFORM public.notify_course_students(
      NEW."courseId", 'exam.published',
      jsonb_build_object('courseId', NEW."courseId", 'examId', NEW."id"),
      'exam.published:' || NEW."id"::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_exam_published_ins ON public.exams;
CREATE TRIGGER notify_exam_published_ins
  AFTER INSERT ON public.exams
  FOR EACH ROW
  WHEN (NEW."status" = 'PUBLISHED')
  EXECUTE FUNCTION public.notify_exam_published();

DROP TRIGGER IF EXISTS notify_exam_published_upd ON public.exams;
CREATE TRIGGER notify_exam_published_upd
  AFTER UPDATE ON public.exams
  FOR EACH ROW
  WHEN (NEW."status" = 'PUBLISHED' AND OLD."status" <> 'PUBLISHED')
  EXECUTE FUNCTION public.notify_exam_published();

-- ---------------------------------------------------------------------------
-- Partial index for the email queue (only rows still waiting to be sent)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS notifications_email_queue_idx
  ON public.notifications ("createdAt")
  WHERE "emailedAt" IS NULL AND "emailAttempts" < 3;
