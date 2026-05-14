export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import LogHoursForm from '@/components/features/LogHoursForm'
import RecentEntries from '@/components/features/RecentEntries'
import type { RecentEntry } from '@/components/features/RecentEntries'
import ProjectDailyAgg from '@/components/features/ProjectDailyAgg'
import { buildProjectGroups } from '@/lib/build-project-groups'
import { ROLE_DISPLAY } from '@/lib/types'

export default async function LogHoursPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)

  const weekAgoForDailyLog = (() => {
    const d = new Date(); d.setDate(d.getDate() - 6)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  const [
    { data: projects },
    { data: recentRaw },
    { data: recentLogRaw },
    { data: dailyWeekLogs },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, created_at')
      .in('status', ['active', 'on_hold', 'complete'])
      .order('name'),
    supabase
      .from('weekly_hours')
      .select('id, week_start, project_id, hours_logged, rating, leave_type, stage, entry_date, project:projects(name)')
      .eq('user_id', user.id)
      .gte('entry_date', cutoff.toISOString())
      .order('entry_date', { ascending: false }),
    // Recent project activity for this user — used to sort the dropdown
    supabase
      .from('weekly_hours')
      .select('project_id, week_start')
      .eq('user_id', user.id)
      .not('project_id', 'is', null)
      .order('week_start', { ascending: false })
      .limit(100),
    // Daily logs for this week (for the project aggregation section)
    supabase
      .from('daily_logs')
      .select('id, log_date')
      .eq('user_id', user.id)
      .gte('log_date', weekAgoForDailyLog),
  ])

  // Fetch daily slots for those logs
  const dailyLogIds = (dailyWeekLogs ?? []).map((l: { id: string }) => l.id)
  const { data: dailyWeekSlots } = dailyLogIds.length > 0
    ? await supabase
        .from('daily_log_slots')
        .select('log_id, start_min, end_min, project_id, phase, priority, project:projects(id, name)')
        .in('log_id', dailyLogIds)
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normSlots = (dailyWeekSlots ?? []).map((s: any) => ({
    log_id:     s.log_id    as string,
    start_min:  s.start_min as number,
    end_min:    s.end_min   as number,
    project_id: (s.project_id ?? null) as string | null,
    phase:      (s.phase      ?? null) as string | null,
    priority:   (s.priority   ?? null) as number | null,
    project: Array.isArray(s.project)
      ? (s.project[0] ? { id: s.project[0].id as string, name: s.project[0].name as string } : null)
      : s.project ?? null,
  }))
  const projectGroups = buildProjectGroups(
    normSlots,
    (dailyWeekLogs ?? []) as { id: string; log_date: string }[],
  )

  // Deduplicate: ordered list of project_ids this user logged recently (most recent first)
  const seenIds = new Set<string>()
  const recentProjectIds: string[] = []
  for (const row of (recentLogRaw ?? []) as { project_id: string; week_start: string }[]) {
    if (!seenIds.has(row.project_id)) {
      seenIds.add(row.project_id)
      recentProjectIds.push(row.project_id)
    }
  }

  // Flatten the project join
  const recentEntries: RecentEntry[] = (recentRaw ?? []).map((r: {
    id: string; week_start: string; project_id: string | null; hours_logged: number;
    rating: number; leave_type: string | null; stage: string | null; entry_date: string;
    project: { name: string }[] | { name: string } | null;
  }) => ({
    id:           r.id,
    week_start:   r.week_start,
    project_id:   r.project_id,
    hours_logged: r.hours_logged,
    rating:       r.rating,
    leave_type:   r.leave_type,
    stage:        r.stage,
    entry_date:   r.entry_date,
    project_name: (Array.isArray(r.project) ? r.project[0]?.name : r.project?.name) ?? null,
  }))

  const projectList = (projects ?? []).map(p => ({ id: p.id, name: p.name, status: p.status, created_at: p.created_at as string }))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/employees" className="text-sm text-teal-100 hover:text-white">← Employees</Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">Log Work Hours</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-teal-100">
            {currentUser?.name ?? user?.email}
            <span className="ml-1.5 px-1.5 py-0.5 bg-teal-600 text-teal-100 rounded text-xs">
              {ROLE_DISPLAY[currentUser?.role ?? ''] ?? currentUser?.role ?? ''}
            </span>
          </span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="border-teal-400 text-teal-100 hover:bg-teal-600 hover:border-teal-300 bg-transparent">Sign out</Button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-lg mx-auto space-y-5">

          {/* Daily plan aggregation — this week by project */}
          {projectGroups.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-base font-semibold text-teal-900 mb-1">This week's daily plan</h2>
              <p className="text-sm text-slate-500 mb-1">Hours you've planned in your daily log, grouped by project. Expand any row to see individual days.</p>
              <ProjectDailyAgg groups={projectGroups} />
            </div>
          )}

          {/* Recent entries — edit / delete */}
          <RecentEntries entries={recentEntries} projects={projectList} />

          {/* New entry form */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold text-teal-900 mb-1">Log hours for last week</h2>
            <p className="text-sm text-slate-500 mb-5">Record your work hours for a specific project and week.</p>
            <LogHoursForm projects={projectList} recentProjectIds={recentProjectIds} />
          </div>

        </div>
      </main>
    </div>
  )
}
