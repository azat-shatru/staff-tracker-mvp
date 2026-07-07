export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import ProjectList from '@/components/features/ProjectList'
import Link from 'next/link'
import { getPermissions } from '@/lib/permissions'
import { weekStart, toDateStr, buildStageTimeline, weekStartStr, HOLIDAY_HOURS } from '@/lib/utilization'
import DashboardInsights from '@/components/features/DashboardInsights'
import type { Project, Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'
import { TRACKED_USERS_OR_FILTER } from '@/lib/tracked-managers'

function getEfficiency(
  project: Project,
  reportingCompletedAt: string | null
) {
  if (!project.target_delivery_date) return null

  const target = new Date(project.target_delivery_date)
  const today  = new Date()
  today.setHours(0, 0, 0, 0)

  if (project.status === 'complete' || project.status === 'archived') {
    if (!reportingCompletedAt) return null
    const completed = new Date(reportingCompletedAt)
    return completed <= target ? 'on_time' : 'late'
  }

  const daysLeft = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0)  return 'overdue'
  return 'ok'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)

  const today        = new Date()
  const thisMonday   = weekStart(today)
  const prevMonday   = new Date(thisMonday)
  prevMonday.setDate(prevMonday.getDate() - 7)
  const prevWeekStr  = toDateStr(prevMonday)

  const thisWeekStr = toDateStr(thisMonday)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)   // YYYY-MM-DD

  const [
    { data: projects },
    { data: allUsers },
    { data: managers },
    { data: reportingStages },
    { data: allAssignments },
    { data: prevWeekHours },
    { data: allStages },
    { data: allStageNotes },
    { data: recentHours },
    { data: holidayRows },
  ] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('users').select('id, name, role, capacity_hours').or(TRACKED_USERS_OR_FILTER).order('name').limit(500),
    supabase.from('users').select('id, name, role').eq('role', 'manager').order('name').limit(200),
    supabase
      .from('project_stages')
      .select('project_id, completed_at')
      .eq('stage', 'reporting')
      .eq('status', 'complete'),
    supabase
      .from('assignments')
      .select('project_id, user_id, role_label, allocation_pct, user:users(id, name, role)')
      .limit(1000),
    supabase
      .from('weekly_hours')
      .select('user_id, hours_logged, week_start, leave_type')
      .gte('week_start', (() => { const d = new Date(prevMonday); d.setDate(d.getDate() - 11 * 7); return d.toISOString().split('T')[0] })())
      .lte('week_start', prevWeekStr),
    supabase
      .from('project_stages')
      .select('id, project_id, stage, status')
      .limit(2000),
    supabase
      .from('stage_notes')
      .select('stage_id, value')
      .eq('field_key', 'expected_hours_per_week'),
    // Projects with log hours entries in the last 30 days
    supabase
      .from('weekly_hours')
      .select('project_id')
      .gte('week_start', thirtyDaysAgoStr)
      .not('project_id', 'is', null),
    // Holidays over the 12-week look-back (table may not exist yet → null → no adjustment).
    // Upper bound = Sunday of the last completed week (holidays can fall mid-week).
    supabase
      .from('holidays')
      .select('holiday_date, name')
      .gte('holiday_date', (() => { const d = new Date(prevMonday); d.setDate(d.getDate() - 11 * 7); return d.toISOString().split('T')[0] })())
      .lte('holiday_date', (() => { const d = new Date(prevMonday); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0] })()),
  ])

  // Map project_id → reporting completed_at
  const reportingDoneAt: Record<string, string> = Object.fromEntries(
    (reportingStages ?? []).map((s: { project_id: string; completed_at: string | null }) => [
      s.project_id,
      s.completed_at ?? '',
    ])
  )

  // Map project_id → assigned members
  type AssignmentRow = { project_id: string; user_id: string; role_label: string; allocation_pct: number; user: { id: string; name: string; role: string } | null }
  const membersByProject: Record<string, AssignmentRow[]> = {}
  for (const a of (allAssignments ?? []) as unknown as AssignmentRow[]) {
    if (!membersByProject[a.project_id]) membersByProject[a.project_id] = []
    // Deduplicate: if user already listed for this project, keep higher allocation
    const existing = membersByProject[a.project_id].findIndex(m => m.user_id === a.user_id)
    if (existing >= 0) {
      if (a.allocation_pct > membersByProject[a.project_id][existing].allocation_pct) {
        membersByProject[a.project_id][existing] = a
      }
    } else {
      membersByProject[a.project_id].push(a)
    }
  }

  // ── Active vs older projects ─────────────────────────────────────────────────
  // "Active" = has weekly_hours log entries in the last 30 days
  // Everything else (no recent logs, completed, archived) goes to the collapsed section
  const projectsWithRecentHours = new Set(
    (recentHours ?? []).map((s: { project_id: string }) => s.project_id)
  )

  const recentProjects = (projects ?? []).filter(
    (p: Project) => projectsWithRecentHours.has(p.id)
  )
  const olderProjects = (projects ?? []).filter(
    (p: Project) => !projectsWithRecentHours.has(p.id)
  )

  // ── Utilization — past 12 weeks ──────────────────────────────────────────────
  type UserWithCap = { id: string; name: string; role: string; capacity_hours: number | null }
  type HoursRow    = { user_id: string; hours_logged: number; week_start: string; leave_type: string | null }

  const employeeCount = (allUsers ?? []).length
  const userCapacity: Record<string, number> = {}
  for (const u of (allUsers ?? []) as UserWithCap[]) {
    userCapacity[u.id] = u.capacity_hours ?? 40
  }
  const allUserIds = Object.keys(userCapacity)

  // Build per-week buckets
  const weekBuckets: Record<string, { workHours: number; leaveByUser: Record<string, number>; activeUsers: Set<string> }> = {}
  for (const h of (prevWeekHours ?? []) as HoursRow[]) {
    if (!weekBuckets[h.week_start]) weekBuckets[h.week_start] = { workHours: 0, leaveByUser: {}, activeUsers: new Set() }
    weekBuckets[h.week_start].activeUsers.add(h.user_id)
    if (h.leave_type) {
      weekBuckets[h.week_start].leaveByUser[h.user_id] = (weekBuckets[h.week_start].leaveByUser[h.user_id] ?? 0) + h.hours_logged
    } else {
      weekBuckets[h.week_start].workHours += h.hours_logged
    }
  }

  // Holidays per week (Monday) → count (for credit) and labels (for the "H" marker).
  const holidayCountByWeek: Record<string, number> = {}
  const holidayLabelByWeek: Record<string, string> = {}
  for (const h of ((holidayRows ?? []) as { holiday_date: string; name: string }[])) {
    const wk = weekStartStr(h.holiday_date)
    holidayCountByWeek[wk] = (holidayCountByWeek[wk] ?? 0) + 1
    const dayLabel = new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const entry = `${h.name} (${dayLabel})`
    holidayLabelByWeek[wk] = holidayLabelByWeek[wk] ? `${holidayLabelByWeek[wk]}, ${entry}` : entry
  }

  function weekUtil(weekStr: string) {
    const bucket = weekBuckets[weekStr]
    const workHours = bucket?.workHours ?? 0
    const leaveByUser = bucket?.leaveByUser ?? {}
    const activeUsers = bucket?.activeUsers ?? new Set<string>()
    // Only count capacity for users who have at least one entry (work or leave) that week
    const totalEffCap = allUserIds.reduce((sum, uid) => {
      if (!activeUsers.has(uid)) return sum
      const leaveHours = leaveByUser[uid] ?? 0
      return sum + Math.max((userCapacity[uid] ?? 40) - leaveHours, 0)
    }, 0)
    // Holiday credit: 8h per holiday that week, per active user, added to the
    // numerator only — capacity (denominator) is unchanged.
    const holidayCredit = (holidayCountByWeek[weekStr] ?? 0) * HOLIDAY_HOURS * activeUsers.size
    const num = workHours + holidayCredit
    const pct = totalEffCap > 0 ? Math.round((num / totalEffCap) * 100) : 0
    return { pct, workHours, totalEffCap }
  }

  // 12-week past array (oldest → newest, newest = prevWeekStr)
  const past12Mondays = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(prevMonday)
    d.setDate(d.getDate() - (11 - i) * 7)
    return toDateStr(d)
  })

  const pastWeeklyUtil = past12Mondays.map(weekStr => {
    const { pct } = weekUtil(weekStr)
    const weekDate = new Date(weekStr)
    const label = weekDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return {
      label, pct, weekStart: weekStr,
      holiday:      (holidayCountByWeek[weekStr] ?? 0) > 0,
      holidayLabel: holidayLabelByWeek[weekStr] ?? '',
    }
  })

  const lastWeekUtilData = weekUtil(prevWeekStr)
  const lastWeekUtil = {
    pct:               lastWeekUtilData.pct,
    hoursLogged:       lastWeekUtilData.workHours,
    effectiveCapacity: lastWeekUtilData.totalEffCap,
  }

  const totalCapacity = allUserIds.reduce((sum, uid) => sum + (userCapacity[uid] ?? 40), 0)

  // ── Projected histogram ─────────────────────────────────────────────────────
  type StageRow = { id: string; project_id: string; stage: string; status: string }
  type NoteRow  = { stage_id: string; value: string }

  const stagesByProject: Record<string, StageRow[]> = {}
  for (const s of (allStages ?? []) as StageRow[]) {
    if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = []
    stagesByProject[s.project_id].push(s)
  }

  const stageIdToInfo: Record<string, { project_id: string; stage: string }> = {}
  for (const s of (allStages ?? []) as StageRow[]) stageIdToInfo[s.id] = { project_id: s.project_id, stage: s.stage }

  const hoursOverridesByProject: Record<string, Record<string, number>> = {}
  for (const n of (allStageNotes ?? []) as NoteRow[]) {
    const info = stageIdToInfo[n.stage_id]
    if (!info) continue
    if (!hoursOverridesByProject[info.project_id]) hoursOverridesByProject[info.project_id] = {}
    hoursOverridesByProject[info.project_id][info.stage] = parseFloat(n.value)
  }

  const projectedByWeek = Array.from({ length: 12 }, (_, w) => {
    const weekDate = new Date(thisMonday)
    weekDate.setDate(weekDate.getDate() + w * 7)
    const weekMs = weekDate.getTime()

    let hours = 0
    for (const project of (projects ?? []) as Project[]) {
      if (project.status !== 'active' && project.status !== 'on_hold') continue
      if (!project.kickoff_date || !project.target_delivery_date) continue

      // allocationPct=100 → predictedHoursPerWeek = total project demand for that stage
      const timeline = buildStageTimeline(
        project.kickoff_date,
        project.target_delivery_date,
        stagesByProject[project.id] ?? [],
        100,
        hoursOverridesByProject[project.id],
      )

      const stageForWeek = timeline.find(s => {
        const start = new Date(s.estimatedStart).getTime()
        const end   = new Date(s.estimatedEnd).getTime() + 86_400_000 // inclusive
        return weekMs >= start && weekMs < end
      })
      if (stageForWeek) hours += stageForWeek.predictedHoursPerWeek
    }

    const label = weekDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return { label, hours: Math.round(hours) }
  })

  const projectedCurrentWeekPct = totalCapacity > 0
    ? Math.round(((projectedByWeek[0]?.hours ?? 0) / totalCapacity) * 100)
    : 0

  // Overall efficiency rate (completed projects only)
  const completedProjects = (projects ?? []).filter(
    (p: Project) => (p.status === 'complete' || p.status === 'archived') && p.target_delivery_date
  )
  const onTimeCount = completedProjects.filter((p: Project) =>
    getEfficiency(p, reportingDoneAt[p.id] ?? null) === 'on_time'
  ).length
  const efficiencyRate = completedProjects.length > 0
    ? Math.round((onTimeCount / completedProjects.length) * 100)
    : null

  const activeProjects  = (projects ?? []).filter((p: Project) => p.status === 'active').length
  const overdueProjects = (projects ?? []).filter((p: Project) =>
    getEfficiency(p, reportingDoneAt[p.id] ?? null) === 'overdue'
  ).length

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold text-white">Staff Tracker</h1>
          {perms.canViewAllProjects && (
            <>
              {perms.canViewUtilization && (
                <Link href="/staffing" className="text-sm text-teal-100 hover:text-white transition-colors">
                  Staffing Matrix
                </Link>
              )}
              {perms.canViewUtilization && (
                <Link href="/team" className="text-sm text-teal-100 hover:text-white transition-colors">
                  Team Overview
                </Link>
              )}
              <Link href="/employees" className="text-sm text-teal-100 hover:text-white transition-colors">
                Employees
              </Link>
              {perms.canManageHolidays && (
                <Link href="/holidays" className="text-sm text-teal-100 hover:text-white transition-colors">
                  Holidays
                </Link>
              )}
            </>
          )}
          {perms.canUseDailyLog && (
            <>
              <Link href="/daily-log" className="text-sm text-teal-100 hover:text-white transition-colors font-medium">
                Daily Log
              </Link>
              <Link href="/team-status" className="text-sm text-teal-100 hover:text-white transition-colors">
                Team Status
              </Link>
            </>
          )}
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
        <div className="max-w-5xl mx-auto space-y-5">

          {/* ── Daily log quick-access card ─────────────────────── */}
          {perms.canUseDailyLog && (
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/daily-log"
                className="flex items-center gap-4 bg-white rounded-lg border border-teal-200 p-4 hover:border-teal-400 hover:shadow-sm transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-xl shrink-0">📋</div>
                <div>
                  <p className="font-semibold text-teal-900 group-hover:text-teal-700">My Daily Log</p>
                  <p className="text-xs text-slate-500">Plan your day · log hours by project</p>
                </div>
              </Link>
              <Link
                href="/team-status"
                className="flex items-center gap-4 bg-white rounded-lg border border-slate-200 p-4 hover:border-teal-300 hover:shadow-sm transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-xl shrink-0">👥</div>
                <div>
                  <p className="font-semibold text-slate-800 group-hover:text-teal-700">Team Status</p>
                  <p className="text-xs text-slate-500">See who's in, busy, or out today</p>
                </div>
              </Link>
            </div>
          )}

          {/* ── Utilization dial + projected histogram ─────────── */}
          {perms.canViewUtilizationSummary && (
            <DashboardInsights
              lastWeekUtil={lastWeekUtil}
              pastWeeklyUtil={pastWeeklyUtil}
              projectedCurrentWeekPct={projectedCurrentWeekPct}
              projectedByWeek={projectedByWeek}
              employeeCount={employeeCount}
              canDrillDown={perms.canViewUtilization}
            />
          )}

          {/* Efficiency summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Active Projects</p>
              <p className="text-2xl font-semibold text-teal-900">{activeProjects}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Overdue</p>
              <p className={`text-2xl font-semibold ${overdueProjects > 0 ? 'text-red-600' : 'text-teal-900'}`}>
                {overdueProjects}
              </p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">On-Time Delivery Rate</p>
              {efficiencyRate !== null ? (
                <p className={`text-2xl font-semibold ${efficiencyRate >= 80 ? 'text-green-600' : efficiencyRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {efficiencyRate}%
                </p>
              ) : (
                <p className="text-2xl font-semibold text-slate-300">—</p>
              )}
              {completedProjects.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">{onTimeCount} of {completedProjects.length} completed on time</p>
              )}
            </div>
          </div>

          {/* Projects list */}
          <ProjectList
            recentProjects={recentProjects as Project[]}
            olderProjects={olderProjects as Project[]}
            membersByProject={membersByProject}
            reportingDoneAt={reportingDoneAt}
            canCreateProject={perms.canCreateProject}
            users={managers ?? []}
          />

        </div>
      </main>
    </div>
  )
}
