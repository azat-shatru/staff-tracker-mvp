-- Migration 006 — Add stage column to weekly_hours
-- Run once in Supabase SQL Editor

ALTER TABLE public.weekly_hours
  ADD COLUMN IF NOT EXISTS stage text;
