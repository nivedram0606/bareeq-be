CREATE TYPE "public"."pay_method" AS ENUM('cash', 'bank_transfer', 'card', 'cheque', 'other');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff', 'viewer');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_org_name_key" UNIQUE("org_id","name"),
	CONSTRAINT "academic_years_dates_check" CHECK ("academic_years"."end_date" > "academic_years"."start_date")
);
--> statement-breakpoint
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" in ('create', 'update', 'void', 'status_change'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grade" text NOT NULL,
	"section" text,
	"academic_year_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_org_year_name_key" UNIQUE("org_id","academic_year_id","name")
);
--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid,
	"title" text NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"discount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_items_id_student_key" UNIQUE("id","student_id"),
	CONSTRAINT "fee_items_amount_check" CHECK ("fee_items"."amount" >= 0),
	CONSTRAINT "fee_items_discount_check" CHECK ("fee_items"."discount" >= 0 and "fee_items"."discount" <= "fee_items"."amount")
);
--> statement-breakpoint
ALTER TABLE "fee_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text NOT NULL,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"currency" text DEFAULT 'OMR' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"brand_color" text DEFAULT '#0f766e' NOT NULL,
	"logo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_default_locale_check" CHECK ("organizations"."default_locale" in ('en', 'ar')),
	CONSTRAINT "organizations_brand_color_check" CHECK ("organizations"."brand_color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fee_item_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"paid_on" date DEFAULT current_date NOT NULL,
	"method" "pay_method" NOT NULL,
	"reference" text,
	"received_by" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_void_check" CHECK (("payments"."voided_at" is null and "payments"."voided_by" is null and "payments"."void_reason" is null) or ("payments"."voided_at" is not null and "payments"."voided_by" is not null and "payments"."void_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"designation" text NOT NULL,
	"phone" text,
	"email" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"admission_no" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"name_ar" text,
	"dob" date NOT NULL,
	"gender" text NOT NULL,
	"class_id" uuid,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"joined_on" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_org_admission_no_key" UNIQUE("org_id","admission_no"),
	CONSTRAINT "students_gender_check" CHECK ("students"."gender" in ('male', 'female'))
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_profiles_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_profiles_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_fee_item_student_fk" FOREIGN KEY ("fee_item_id","student_id") REFERENCES "public"."fee_items"("id","student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_one_current_per_org" ON "academic_years" USING btree ("org_id") WHERE "academic_years"."is_current";--> statement-breakpoint
CREATE INDEX "audit_log_org_entity_idx" ON "audit_log" USING btree ("org_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "fee_items_org_student_idx" ON "fee_items" USING btree ("org_id","student_id");--> statement-breakpoint
CREATE INDEX "guardians_student_idx" ON "guardians" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_one_primary_per_student" ON "guardians" USING btree ("student_id") WHERE "guardians"."is_primary";--> statement-breakpoint
CREATE INDEX "payments_org_paid_on_idx" ON "payments" USING btree ("org_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_fee_item_idx" ON "payments" USING btree ("fee_item_id");--> statement-breakpoint
CREATE INDEX "profiles_org_idx" ON "profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "staff_org_idx" ON "staff" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "students_org_class_status_idx" ON "students" USING btree ("org_id","class_id","status");--> statement-breakpoint
CREATE INDEX "students_org_last_name_idx" ON "students" USING btree ("org_id",lower("last_name"));