-- =============================================
-- Staff Tracker — Database Schema
-- Run this in Supabase SQL Editor (once)
-- =============================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- =============================================
-- ENUMS
-- =============================================
create type user_role as enum ('executive', 'manager', 'analyst');
create type stage_type as enum ('kickoff', 'questionnaire', 'programming', 'fielding', 'templating', 'analysis', 'reporting');
create type stage_status as enum ('pending', 'in_progress', 'blocked', 'complete');
create type project_status as enum ('active', 'on_hold', 'complete', 'archived');
create type deliverable_type as enum ('daily', 'weekly', 'final');
create type deliverable_status as enum ('pending', 'qc_required', 'sent', 'complete');

-- =============================================
-- USERS (extends Supabase auth.users)
-- =============================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'analyst',
  capacity_hours numeric not null default 40,
  efficiency_modifier numeric not null default 1.0,
  created_at timestamptz not null default now()
);

-- =============================================
-- PROJECTS
-- =============================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null,
  project_type text not null default '',
  status project_status not null default 'active',
  kickoff_date date,
  target_delivery_date date,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- =============================================
-- PROJECT STAGES
-- =============================================
create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage stage_type not null,
  status stage_status not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  unique(project_id, stage)
);

-- =============================================
-- STAGE HISTORY (audit log)
-- =============================================
create table public.stage_history (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  from_status stage_status,
  to_status stage_status not null,
  changed_by uuid not null references public.users(id),
  changed_at timestamptz not null default now(),
  notes text
);

-- =============================================
-- STAGE NOTES (per-stage key-value fields)
-- =============================================
create table public.stage_notes (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  field_key text not null,
  value text not null default '',
  unique(stage_id, field_key)
);

-- =============================================
-- ASSIGNMENTS (staffing allocations)
-- =============================================
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_label text not null default '',
  allocation_pct numeric not null default 0 check (allocation_pct >= 0 and allocation_pct <= 100),
  start_date date,
  end_date date
);

-- =============================================
-- POC REGISTRY
-- =============================================
create table public.poc_registry (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_name text not null,
  user_id uuid references public.users(id)
);

-- =============================================
-- DELIVERABLES
-- =============================================
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  name text not null,
  type deliverable_type not null default 'final',
  expected_at timestamptz,
  delivered_at timestamptz,
  qc_approved_by uuid references public.users(id),
  status deliverable_status not null default 'pending'
);

-- =============================================
-- LEAVE
-- =============================================
create table public.leave (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  type text not null default 'annual',
  notes text
);

-- =============================================
-- FILE LINKS (OneDrive URLs)
-- =============================================
create table public.file_links (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  onedrive_url text not null,
  added_by uuid not null references public.users(id),
  added_at timestamptz not null default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.project_stages enable row level security;
alter table public.stage_history enable row level security;
alter table public.stage_notes enable row level security;
alter table public.assignments enable row level security;
alter table public.poc_registry enable row level security;
alter table public.deliverables enable row level security;
alter table public.leave enable row level security;
alter table public.file_links enable row level security;

-- Users: everyone can read; only self can update own row
create policy "Users can read all profiles" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- Projects: executives/managers see all; analysts see only assigned projects
create policy "Executives and managers see all projects" on public.projects
  for select using (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );

create policy "Analysts see assigned projects" on public.projects
  for select using (
    exists (select 1 from public.assignments where project_id = projects.id and user_id = auth.uid())
  );

create policy "Managers can insert projects" on public.projects
  for insert with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );

create policy "Managers can update projects" on public.projects
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );

-- Stages, notes, deliverables, history: inherit project visibility
create policy "Read project stages" on public.project_stages
  for select using (
    exists (
      select 1 from public.projects p
      left join public.assignments a on a.project_id = p.id
      where p.id = project_stages.project_id
        and (
          exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
          or a.user_id = auth.uid()
        )
    )
  );

create policy "Manage project stages" on public.project_stages
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );

create policy "Read stage notes" on public.stage_notes for select using (true);
create policy "Manage stage notes" on public.stage_notes for all using (auth.uid() is not null);

create policy "Read stage history" on public.stage_history for select using (true);
create policy "Insert stage history" on public.stage_history for insert with check (auth.uid() is not null);

create policy "Read assignments" on public.assignments for select using (true);
create policy "Manage assignments" on public.assignments
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );

create policy "Read poc registry" on public.poc_registry for select using (true);
create policy "Manage poc registry" on public.poc_registry for all using (auth.uid() is not null);

create policy "Read deliverables" on public.deliverables for select using (true);
create policy "Manage deliverables" on public.deliverables for all using (auth.uid() is not null);

create policy "Read own leave" on public.leave for select using (auth.uid() = user_id);
create policy "Managers read all leave" on public.leave
  for select using (
    exists (select 1 from public.users where id = auth.uid() and role in ('executive', 'manager'))
  );
create policy "Manage leave" on public.leave for all using (auth.uid() = user_id);

create policy "Read file links" on public.file_links for select using (true);
create policy "Manage file links" on public.file_links for all using (auth.uid() is not null);

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
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'analyst')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
