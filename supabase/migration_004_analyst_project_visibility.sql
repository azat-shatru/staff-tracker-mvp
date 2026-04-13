-- Migration 004 — Allow analysts to see all projects
-- Analysts previously only saw projects they were assigned to.
-- Now they should see all projects (same as consultants/managers)
-- so they can log hours against any project.
-- Run once in Supabase SQL Editor.

drop policy if exists "Privileged roles see all projects" on public.projects;
drop policy if exists "Analysts see assigned projects"    on public.projects;

create policy "Authenticated users see all projects" on public.projects
  for select using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('executive', 'manager', 'director', 'consultant', 'analyst')
    )
  );
