ALTER TABLE "classes" ADD COLUMN "teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classes_teacher_idx" ON "classes" USING btree ("teacher_id");--> statement-breakpoint
-- Natural ordering for codes such as admission numbers: every run of digits compares as a number,
-- so ADM-2 < ADM-10 < ADM-100 (BUG-009). ICU ships with standard PostgreSQL builds and Supabase.
CREATE COLLATION IF NOT EXISTS "natural_sort" (provider = icu, locale = 'und-u-kn');
