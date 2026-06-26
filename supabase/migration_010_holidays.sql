-- migration_010_holidays.sql
-- Company holiday calendar. One row per holiday date.
-- Used by the utilization calc: for any week containing a holiday, an employee
-- who logged hours that week gets +8h per holiday added to the NUMERATOR
-- (work hours) only — the denominator (effective capacity) is unchanged.
-- If a year has no rows here, that year simply has no holidays (no adjustment).

CREATE TABLE IF NOT EXISTS public.holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,        -- dedupe: one holiday per calendar day
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS holidays_date_idx ON public.holidays (holiday_date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'holidays' AND policyname = 'Read holidays') THEN
    CREATE POLICY "Read holidays" ON public.holidays FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'holidays' AND policyname = 'Manage holidays') THEN
    CREATE POLICY "Manage holidays" ON public.holidays FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
