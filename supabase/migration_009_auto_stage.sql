-- migration_009_auto_stage.sql
-- Tracks whether a stage was manually set by a user.
-- When manually_set_at is NOT NULL, the auto-stage cron will leave that stage alone.
-- Cleared by setting manually_set_at = NULL if you want auto to take over again.

ALTER TABLE project_stages
  ADD COLUMN IF NOT EXISTS manually_set_at timestamptz;
