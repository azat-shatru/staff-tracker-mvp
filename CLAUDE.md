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
- `lib/utilization.ts` — `weekStart`, `toDateStr`, `buildStageTimeline` utilities

## Key data model notes
- `weekly_hours` has `user_id, hours_logged, week_start, leave_type` — **no `project_id`**
- `project_stages` has `started_at` and `completed_at` — **no `updated_at`**
- "Recent project" = stage `started_at`/`completed_at` within last 7 days, OR `projects.created_at` within last 7 days
- Assignments link users to projects: `assignments(project_id, user_id, allocation_pct, ...)`

## Dashboard project list behaviour
- Projects with recent stage activity (last 7 days) or newly created appear at the top
- Older projects are hidden behind a collapsible toggle row
- A search bar (name, client, project type) bypasses the split and shows all matches inline

## Build & deploy
```bash
npm run build        # always run before pushing to prod
git push prod main   # triggers Vercel production deployment
```
