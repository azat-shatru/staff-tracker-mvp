-- migration_008_daily_logs_retention.sql
-- Allow service-role (admin) deletes on daily_logs + slots for the cleanup cron.
-- The API route uses createAdminClient() which bypasses RLS, so these policies
-- are belt-and-suspenders and also let managers run manual purges via the app client.

-- Delete policy: only service-role / managers can delete daily_log rows
create policy "admin delete daily_logs"
  on daily_logs for delete to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('manager', 'admin')
    )
  );

-- Slots cascade from daily_logs, but add an explicit delete policy as well
create policy "admin delete daily_log_slots"
  on daily_log_slots for delete to authenticated
  using (
    exists (
      select 1 from daily_logs dl
        join users u on u.id = auth.uid()
       where dl.id = log_id
         and u.role in ('manager', 'admin')
    )
  );

-- ─── Optional: pg_cron (Supabase Pro / pg_cron extension required) ────────────
-- Run this block separately in the SQL editor only if pg_cron is enabled on your plan.
--
-- select cron.schedule(
--   'cleanup-old-daily-logs',
--   '0 2 * * *',           -- 2 AM UTC daily
--   $$
--     delete from daily_logs
--      where log_date < current_date - interval '30 days';
--   $$
-- );
