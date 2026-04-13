-- =============================================
-- Staff Tracker — Complete Cloud Setup
-- Paste this entire file into Supabase SQL Editor
-- and click Run (once on a fresh project)
-- =============================================

-- Extensions
create extension if not exists "pgcrypto";

-- =============================================
-- ENUMS
-- =============================================
-- Note: user_role is plain text (no enum) to avoid type-not-found errors

do $$ begin
  create type stage_type as enum ('kickoff', 'questionnaire', 'programming', 'fielding', 'templating', 'analysis', 'reporting');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stage_status as enum ('pending', 'in_progress', 'blocked', 'complete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('active', 'on_hold', 'complete', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deliverable_type as enum ('daily', 'weekly', 'final', 'ad_hoc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deliverable_status as enum ('pending', 'qc_required', 'sent', 'complete');
exception when duplicate_object then null; end $$;

-- =============================================
-- USERS (extends Supabase auth.users)
-- =============================================
create table if not exists public.users (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text not null,
  email              text not null unique,
  role               text not null default 'analyst',
  team               text not null default '',
  reports_to         uuid references public.users(id) on delete set null,
  capacity_hours     numeric not null default 40,
  efficiency_modifier numeric not null default 1.0,
  created_at         timestamptz not null default now()
);

-- =============================================
-- PROJECTS
-- =============================================
create table if not exists public.projects (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  client               text not null,
  project_type         text not null default '',
  status               project_status not null default 'active',
  kickoff_date         date,
  target_delivery_date date,
  project_manager_id   uuid references public.users(id) on delete set null,
  created_by           uuid not null references public.users(id),
  created_at           timestamptz not null default now()
);

-- =============================================
-- PROJECT STAGES
-- =============================================
create table if not exists public.project_stages (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  stage        stage_type not null,
  status       stage_status not null default 'pending',
  started_at   timestamptz,
  completed_at timestamptz,
  unique(project_id, stage)
);

-- =============================================
-- STAGE HISTORY (audit log)
-- =============================================
create table if not exists public.stage_history (
  id          uuid primary key default gen_random_uuid(),
  stage_id    uuid not null references public.project_stages(id) on delete cascade,
  from_status stage_status,
  to_status   stage_status not null,
  changed_by  uuid not null references public.users(id),
  changed_at  timestamptz not null default now(),
  notes       text
);

-- =============================================
-- STAGE NOTES (per-stage key-value fields)
-- =============================================
create table if not exists public.stage_notes (
  id        uuid primary key default gen_random_uuid(),
  stage_id  uuid not null references public.project_stages(id) on delete cascade,
  field_key text not null,
  value     text not null default '',
  unique(stage_id, field_key)
);

-- =============================================
-- ASSIGNMENTS (staffing allocations)
-- =============================================
create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  role_label     text not null default '',
  allocation_pct numeric not null default 0 check (allocation_pct >= 0 and allocation_pct <= 100),
  start_date     date,
  end_date       date
);

-- =============================================
-- POC REGISTRY
-- =============================================
create table if not exists public.poc_registry (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_name  text not null,
  user_id    uuid references public.users(id) on delete set null
);

-- =============================================
-- DELIVERABLES
-- =============================================
create table if not exists public.deliverables (
  id             uuid primary key default gen_random_uuid(),
  stage_id       uuid not null references public.project_stages(id) on delete cascade,
  name           text not null,
  type           deliverable_type not null default 'final',
  expected_at    timestamptz,
  delivered_at   timestamptz,
  qc_approved_by uuid references public.users(id) on delete set null,
  status         deliverable_status not null default 'pending'
);

-- =============================================
-- WEEKLY HOURS
-- =============================================
create table if not exists public.weekly_hours (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete cascade,  -- nullable: leave rows have no project
  week_start   date not null,
  hours_logged numeric not null default 0 check (hours_logged >= 0),
  rating       integer check (rating >= 0 and rating <= 7),
  leave_type   text,         -- null = work row; 'paid_leave' / 'sick_leave' = leave row
  entry_date   timestamptz not null default now()
);

-- Partial unique index: one work row per (user, project, week)
create unique index if not exists weekly_hours_work_unique
  on public.weekly_hours (user_id, project_id, week_start)
  where project_id is not null;

-- =============================================
-- FILE LINKS (OneDrive URLs)
-- =============================================
create table if not exists public.file_links (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  file_name    text not null,
  onedrive_url text not null,
  added_by     uuid not null references public.users(id),
  added_at     timestamptz not null default now()
);

-- =============================================
-- DROP LEGACY COLUMNS (idempotent cleanup)
-- =============================================
alter table public.users        drop column if exists designation;
alter table public.weekly_hours drop column if exists designation;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table public.users          enable row level security;
alter table public.projects       enable row level security;
alter table public.project_stages enable row level security;
alter table public.stage_history  enable row level security;
alter table public.stage_notes    enable row level security;
alter table public.assignments    enable row level security;
alter table public.poc_registry   enable row level security;
alter table public.deliverables   enable row level security;
alter table public.weekly_hours   enable row level security;
alter table public.file_links     enable row level security;

-- Users
drop policy if exists "Users can read all profiles"   on public.users;
drop policy if exists "Users can update own profile"  on public.users;
drop policy if exists "Service role can insert users" on public.users;
create policy "Users can read all profiles"   on public.users for select using (true);
create policy "Users can update own profile"  on public.users for update using (auth.uid() = id);
create policy "Service role can insert users" on public.users for insert with check (true);

-- Projects
drop policy if exists "Privileged roles see all projects"    on public.projects;
drop policy if exists "Analysts see assigned projects"        on public.projects;
drop policy if exists "Authenticated users see all projects"  on public.projects;
drop policy if exists "Managers can insert projects"          on public.projects;
drop policy if exists "Managers can update projects"          on public.projects;
-- All authenticated users can see all projects (everyone needs to log hours against any project)
create policy "Authenticated users see all projects" on public.projects
  for select using (auth.uid() is not null);
create policy "Managers can insert projects" on public.projects
  for insert with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );
create policy "Managers can update projects" on public.projects
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );

-- Stages
drop policy if exists "Read project stages"   on public.project_stages;
drop policy if exists "Manage project stages" on public.project_stages;
create policy "Read project stages"   on public.project_stages for select using (true);
create policy "Manage project stages" on public.project_stages for all using (auth.uid() is not null);

-- Stage notes, history, assignments, poc, deliverables, files
drop policy if exists "Read stage notes"     on public.stage_notes;
drop policy if exists "Manage stage notes"   on public.stage_notes;
drop policy if exists "Read stage history"   on public.stage_history;
drop policy if exists "Insert stage history" on public.stage_history;
drop policy if exists "Read assignments"     on public.assignments;
drop policy if exists "Manage assignments"   on public.assignments;
drop policy if exists "Read poc registry"    on public.poc_registry;
drop policy if exists "Manage poc registry"  on public.poc_registry;
drop policy if exists "Read deliverables"    on public.deliverables;
drop policy if exists "Manage deliverables"  on public.deliverables;
drop policy if exists "Read weekly hours"    on public.weekly_hours;
drop policy if exists "Manage weekly hours"  on public.weekly_hours;
drop policy if exists "Read file links"      on public.file_links;
drop policy if exists "Manage file links"    on public.file_links;
create policy "Read stage notes"    on public.stage_notes    for select using (true);
create policy "Manage stage notes"  on public.stage_notes    for all    using (auth.uid() is not null);
create policy "Read stage history"  on public.stage_history  for select using (true);
create policy "Insert stage history" on public.stage_history for insert with check (auth.uid() is not null);
create policy "Read assignments"    on public.assignments    for select using (true);
create policy "Manage assignments"  on public.assignments    for all    using (auth.uid() is not null);
create policy "Read poc registry"   on public.poc_registry   for select using (true);
create policy "Manage poc registry" on public.poc_registry   for all    using (auth.uid() is not null);
create policy "Read deliverables"   on public.deliverables   for select using (true);
create policy "Manage deliverables" on public.deliverables   for all    using (auth.uid() is not null);
create policy "Read weekly hours"   on public.weekly_hours   for select using (true);
create policy "Manage weekly hours" on public.weekly_hours   for all    using (auth.uid() is not null);
create policy "Read file links"     on public.file_links     for select using (true);
create policy "Manage file links"   on public.file_links     for all    using (auth.uid() is not null);

-- =============================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'analyst')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
