-- Migration 004 — All authenticated users can see all projects
-- Previously analysts only saw assigned projects, blocking the
-- log hours dropdown for anyone not yet assigned to a project.
-- All roles need to see all projects to log hours against them.
-- Run once in Supabase SQL Editor.

drop policy if exists "Privileged roles see all projects"   on public.projects;
drop policy if exists "Analysts see assigned projects"      on public.projects;
drop policy if exists "Authenticated users see all projects" on public.projects;

create policy "Authenticated users see all projects" on public.projects
  for select using (auth.uid() is not null);
