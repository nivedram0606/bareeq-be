-- Hand-written migration: updated_at triggers, balance views, privileges, storage bucket.
-- RLS itself is enabled on every table by 0000_init (Drizzle `.enableRLS()`), with no policies.

-- ---------------------------------------------------------------- updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER academic_years_set_updated_at BEFORE UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER classes_set_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER students_set_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER guardians_set_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER fee_items_set_updated_at BEFORE UPDATE ON public.fee_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- ------------------------------------------------------------ balance views
-- security_invoker: the views obey the RLS of the caller, so anon/authenticated
-- (which have no policies) see nothing even if they can reach the view.
CREATE VIEW public.v_fee_balances WITH (security_invoker = true) AS
SELECT
  f.id               AS fee_item_id,
  f.org_id,
  f.student_id,
  f.academic_year_id,
  f.title,
  f.amount,
  f.discount,
  f.due_date,
  (f.amount - f.discount)::numeric(12,3)                         AS net_due,
  coalesce(p.paid, 0)::numeric(12,3)                             AS paid,
  (f.amount - f.discount - coalesce(p.paid, 0))::numeric(12,3)   AS outstanding,
  CASE
    WHEN coalesce(p.paid, 0) >= f.amount - f.discount THEN 'paid'
    WHEN coalesce(p.paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END                                                            AS status
FROM public.fee_items f
LEFT JOIN (
  SELECT fee_item_id, sum(amount) AS paid
  FROM public.payments
  WHERE voided_at IS NULL
  GROUP BY fee_item_id
) p ON p.fee_item_id = f.id;
--> statement-breakpoint
CREATE VIEW public.v_student_balances WITH (security_invoker = true) AS
SELECT
  s.id                                         AS student_id,
  s.org_id,
  coalesce(sum(b.net_due), 0)::numeric(12,3)     AS net_due,
  coalesce(sum(b.paid), 0)::numeric(12,3)        AS paid,
  coalesce(sum(b.outstanding), 0)::numeric(12,3) AS outstanding,
  CASE
    WHEN coalesce(sum(b.paid), 0) >= coalesce(sum(b.net_due), 0) THEN 'paid'
    WHEN coalesce(sum(b.paid), 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END                                          AS status
FROM public.students s
LEFT JOIN public.v_fee_balances b ON b.student_id = s.id
GROUP BY s.id, s.org_id;
--> statement-breakpoint

-- --------------------------------------------------------------- privileges
-- Belt and braces on top of RLS: the browser roles get no access to app objects.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  -- Supabase browser roles; absent on plain Postgres.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;
  END IF;
END;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------- storage bucket
-- Public-read logo bucket; uploads go through the API with the service-role key.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('branding', 'branding', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/svg+xml'])
    ON CONFLICT (id) DO UPDATE
      SET public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END;
$$;
