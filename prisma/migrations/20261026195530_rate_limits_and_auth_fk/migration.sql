-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "rate_limits_windowStart_idx" ON "rate_limits"("windowStart");

-- =============================================================================
-- Append this WHOLE file to the end of the generated migration.sql
-- (migrations/<timestamp>_rate_limits_and_auth_fk/migration.sql).
-- Every statement is idempotent, so it is safe on a database that already has some of it.
-- =============================================================================

-- 0. The signup trigger, so a fresh environment (staging, production) gets it from migrations
--    and not only from the manual fix that was run in the Supabase SQL editor.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta      jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name    text    := btrim(coalesce(meta->>'full_name', ''));
  v_phone   text    := btrim(coalesce(meta->>'phone', ''));
  v_country text    := upper(btrim(coalesce(meta->>'country', '')));
  v_locale  text    := lower(btrim(coalesce(meta->>'locale', 'ar')));
  v_tz      text    := btrim(coalesce(meta->>'timezone', 'UTC'));
  v_consent boolean := coalesce(meta->>'data_sharing_consent', 'false') = 'true';
BEGIN
  IF new.email IS NULL OR char_length(new.email) = 0 THEN
    RAISE EXCEPTION 'email is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'invalid full_name' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^\+?[0-9][-0-9 ()]{5,19}$' THEN
    RAISE EXCEPTION 'invalid phone' USING ERRCODE = '22023';
  END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid country' USING ERRCODE = '22023';
  END IF;
  IF v_locale NOT IN ('ar', 'en') THEN v_locale := 'ar'; END IF;
  IF char_length(v_tz) = 0 OR char_length(v_tz) > 64 THEN v_tz := 'UTC'; END IF;

  INSERT INTO public.users
    (id, email, "fullName", phone, country, locale, timezone, "dataSharingConsentAt", "updatedAt")
  VALUES
    (new.id, new.email, v_name, v_phone, v_country, v_locale, v_tz,
     CASE WHEN v_consent THEN now() END, now());

  RETURN new;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
    EXECUTE 'CREATE TRIGGER on_auth_user_created
               AFTER INSERT ON auth.users
               FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user()';
  END IF;
END $$;

-- 1. Same deny-by-default Row Level Security as every other table
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;

-- 2. Prisma cannot introspect a foreign key that points into the `auth` schema (error P4002),
--    and that breaks `prisma migrate dev` for good. Profiles are still created only by the
--    signup trigger, so the constraint is not needed to keep the two in step.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_id_auth_fk";

-- 3. The foreign key also used to block deleting an auth account that has a profile.
--    Replace that with explicit behaviour: when an auth account is deleted, disable the profile
--    (its attendance, grades and submissions are kept) and free the email address so the same
--    person can register again.
CREATE OR REPLACE FUNCTION public.handle_deleted_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.users
     SET "deletedAt" = now(),
         status = 'SUSPENDED',
         email = 'deleted+' || old.id::text || '@invalid.local',
         "updatedAt" = now()
   WHERE id = old.id AND "deletedAt" IS NULL;
  RETURN old;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users';
    EXECUTE 'CREATE TRIGGER on_auth_user_deleted
               AFTER DELETE ON auth.users
               FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_auth_user()';
  END IF;
END $$;