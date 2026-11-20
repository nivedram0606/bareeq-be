-- Staff designation becomes a fixed list (BUG-001). Map existing free-text values onto it by
-- keyword; anything unrecognised becomes 'other'.
UPDATE "staff" SET "designation" = CASE
  WHEN "designation" ILIKE '%principal%' OR "designation" ILIKE '%head%' THEN 'principal'
  WHEN "designation" ILIKE '%teacher%' THEN 'teacher'
  WHEN "designation" ILIKE '%account%' THEN 'accountant'
  WHEN "designation" ILIKE '%admin%' THEN 'administrator'
  ELSE 'other'
END
WHERE "designation" NOT IN ('teacher', 'principal', 'accountant', 'administrator', 'other');--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_designation_check" CHECK ("staff"."designation" in ('teacher', 'principal', 'accountant', 'administrator', 'other'));
