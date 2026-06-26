@AGENTS.md

# Project: Staff Tracker

A Next.js 16 (Turbopack) staff tracking app deployed on Vercel. Supabase is the database/auth backend.

## Git remotes
- `prod` → `https://github.com/azat-shatru/staff-tracker-mvp.git` — **live production** (Vercel auto-deploys from this)
- `deploy` → `https://github.com/azat-shatru/staff-tracking-app.git` — staging/CI pipeline
- `origin` → `https://github.com/azat-shatru/Dashboard-T1.git`

## Branching rules
- Never commit directly to `main` for non-trivial changes — use a feature branch
- Push to `deploy` first to verify, then merge to `main` and push to `prod`
- Current working branch: `main`

## Architecture
- `app/dashboard/page.tsx` — server component, fetches all data via Supabase, passes to client components
- `components/features/ProjectList.tsx` — client component, handles project list rendering, search, and the recent/older collapse toggle
- `components/features/DashboardInsights.tsx` — utilization charts
- `components/features/NewProjectModal.tsx` — create project modal
- `lib/types.ts` — shared TypeScript types (`Project`, `User`, `Role`, etc.)
- `lib/permissions.ts` — role-based permission helpers
- `lib/utilization.ts` — `weekStart`, `weekStartStr`, `toDateStr`, `getPeriodBounds`, `buildStageTimeline`, plus shared `effectiveCapacity`/`utilizationPct`/`holidayCreditHours` helpers (used by the Utilization page, Staffing matrix, and dashboard trend so their numbers stay identical)
- `app/holidays/` — admin page + server actions to upload the company holiday list (.xlsx, parsed server-side with `exceljs`)

## Key data model notes
- `weekly_hours` has `user_id, project_id, hours_logged, week_start, leave_type`. `project_id` is **nullable** (created in migration_001, NOT NULL dropped in migration_003) — leave entries have a null `project_id`, work entries set it. Filter `leave_type IS NULL` for work hours.
- `project_stages` has `started_at` and `completed_at` — **no `updated_at`**
- "Recent project" = stage `started_at`/`completed_at` within last 7 days, OR `projects.created_at` within last 7 days
- Assignments link users to projects: `assignments(project_id, user_id, allocation_pct, ...)`
- `holidays` (migration_010) has `holiday_date (unique), name`. Uploaded via `/holidays` from the SRI holiday Excel (cols: SL.No. · Holiday · Date · Day). Upload replaces the whole year; dedupes by date. Manager/Executive only (`canManageHolidays`).

## Utilization calculation (single source of truth)
- Per active week: `effectiveCapacity = max(activeWeeks × capacity/week − leaveHours, 0)`; `utilization% = workHours / effectiveCapacity`. Leave is excluded from the numerator and reduces capacity. A week is "active" if the user logged anything (work or leave) that week.
- **Holiday credit**: for any week containing a holiday, each employee who logged that week gets `+8h per holiday` (`HOLIDAY_HOURS`) added to **both** numerator and denominator. Two holidays in one week → +16h. Years with no `holidays` rows → no adjustment.
- Applied identically in three places via the shared helpers: Staffing matrix `Actual %` (last completed week), Utilization page (`utilization-actions.ts` / `UtilizationDetail`), and the dashboard 12-week trend + last-week widget (`dashboard/page.tsx` `weekUtil`).
- `Actual %` everywhere uses the **last completed week** (the current week is always in-progress).

## Dashboard project list behaviour
- Projects with recent stage activity (last 7 days) or newly created appear at the top
- Older projects are hidden behind a collapsible toggle row
- A search bar (name, client, project type) bypasses the split and shows all matches inline

## Migrations
- SQL files live in `supabase/migration_NNN_*.sql` and are applied **manually** in the Supabase dashboard → SQL Editor (there is no DB connection string in `.env.local`, so DDL can't run from the JS client). Write them idempotent. Run the migration **before** deploying code that depends on the new schema.

## Build & deploy
```bash
npm run build        # always run before pushing to prod
git push prod main   # triggers Vercel production deployment
```
