-- Local username/password auth replaces Supabase Auth; logos move from Supabase Storage into Postgres.
-- Works on a fresh plain-Postgres database and on an existing Supabase-hosted one.
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_mime" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_data" "bytea";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing users sign in with their e-mail address as their username.
UPDATE "profiles" SET "username" = lower("email") WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
-- Supabase Auth stores bcrypt hashes, so existing passwords keep working after the switch.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE public.profiles p
       SET password_hash = u.encrypted_password
      FROM auth.users u
     WHERE u.id = p.id
       AND p.password_hash IS NULL
       AND u.encrypted_password LIKE '$2%';
  END IF;
END;
$$;--> statement-breakpoint
-- Logos stored in Supabase Storage are not copied; clear the dangling paths (re-upload in Settings).
UPDATE "organizations" SET "logo_path" = NULL WHERE "logo_data" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles" USING btree (lower("username"));
