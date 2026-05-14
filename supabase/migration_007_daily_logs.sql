-- migration_007_daily_logs.sql
-- Daily planning / worklog tables

-- One row per user per day (the "header")
create table if not exists daily_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  log_date     date not null default current_date,
  status       text not null default 'WFO' check (status in ('WFO', 'WFH', 'OOO')),
  ooo_set_by   uuid references users(id),   -- who marked this person OOO
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, log_date)
);

-- One row per time block per daily_log
create table if not exists daily_log_slots (
  id          uuid primary key default gen_random_uuid(),
  log_id      uuid not null references daily_logs(id) on delete cascade,
  start_min   smallint not null,   -- minutes from midnight, e.g. 660 = 11:00 am
  end_min     smallint not null,   -- minutes from midnight, e.g. 720 = 12:00 pm
  project_id  uuid references projects(id),
  phase       text,
  priority    smallint check (priority between 1 and 5),
  deliverable boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint valid_time_range check (end_min > start_min),
  unique(log_id, start_min)
);

create index if not exists daily_logs_user_date    on daily_logs(user_id, log_date desc);
create index if not exists daily_logs_date         on daily_logs(log_date desc);
create index if not exists daily_log_slots_log     on daily_log_slots(log_id);
create index if not exists daily_log_slots_project on daily_log_slots(project_id);

-- RLS ------------------------------------------------------------------
alter table daily_logs      enable row level security;
alter table daily_log_slots enable row level security;

create policy "auth read daily_logs"
  on daily_logs for select to authenticated using (true);

create policy "auth insert daily_logs"
  on daily_logs for insert to authenticated with check (true);

create policy "auth update daily_logs"
  on daily_logs for update to authenticated using (true);

create policy "auth read daily_log_slots"
  on daily_log_slots for select to authenticated using (true);

create policy "owner manage daily_log_slots"
  on daily_log_slots for all to authenticated
  using (
    exists (
      select 1 from daily_logs dl
      where dl.id = log_id and dl.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from daily_logs dl
      where dl.id = log_id and dl.user_id = auth.uid()
    )
  );
