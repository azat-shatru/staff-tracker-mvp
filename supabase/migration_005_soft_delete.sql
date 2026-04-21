-- Migration 005 — Soft-delete employees via active flag
-- Run once in Supabase SQL Editor

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
