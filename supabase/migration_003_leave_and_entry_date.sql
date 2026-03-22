-- Migration 003 — Leave entries + entry_date in weekly_hours
-- Run once in Supabase SQL Editor

-- 1. Add entry_date so we know when each row was submitted
ALTER TABLE public.weekly_hours
  ADD COLUMN IF NOT EXISTS entry_date timestamptz NOT NULL DEFAULT now();

-- 2. Add leave_type (non-null means this is a leave row, not a work row)
ALTER TABLE public.weekly_hours
  ADD COLUMN IF NOT EXISTS leave_type text;

-- 3. Make project_id nullable so leave rows don't need a project FK
ALTER TABLE public.weekly_hours ALTER COLUMN project_id DROP NOT NULL;

-- 4. Drop the old unique constraint (project_id is now nullable)
ALTER TABLE public.weekly_hours
  DROP CONSTRAINT IF EXISTS weekly_hours_user_id_project_id_week_start_key;

-- 5. Partial unique index: only one work-hour row per (user, project, week)
--    Leave rows are exempt (project_id IS NULL) so multiple leave days per week are allowed
CREATE UNIQUE INDEX IF NOT EXISTS weekly_hours_work_unique
  ON public.weekly_hours (user_id, project_id, week_start)
  WHERE project_id IS NOT NULL;
