-- =============================================
-- Migration 001 — Add missing columns & tables
-- Run this once in Supabase SQL Editor
-- =============================================

-- 1. Add missing enum values to user_role
--    (ALTER TYPE ADD VALUE cannot run inside a transaction,
--     so run each statement individually if needed)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'director';

-- 2. Add missing columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. Add project_manager_id to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 4. Create weekly_hours table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.weekly_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  hours_logged numeric NOT NULL DEFAULT 0 CHECK (hours_logged >= 0),
  UNIQUE (user_id, project_id, week_start)
);

-- Enable RLS on weekly_hours
ALTER TABLE public.weekly_hours ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weekly_hours' AND policyname = 'Read weekly hours') THEN
    CREATE POLICY "Read weekly hours" ON public.weekly_hours FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weekly_hours' AND policyname = 'Manage weekly hours') THEN
    CREATE POLICY "Manage weekly hours" ON public.weekly_hours FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
