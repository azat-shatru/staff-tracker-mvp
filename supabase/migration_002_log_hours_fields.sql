-- Migration 002 — Add designation and rating to weekly_hours
-- Run once in Supabase SQL Editor

ALTER TABLE public.weekly_hours
  ADD COLUMN IF NOT EXISTS designation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rating integer CHECK (rating >= 0 AND rating <= 7);
