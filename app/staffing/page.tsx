export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getPermissions } from '@/lib/permissions'
import type { Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'
import {
  STAGE_HOURS, CAPACITY_PER_WEEK,
  getPeriodBounds, buildStageTimeline,
  type UserUtilizationData, type ProjectBreakdown,
} from '@/lib/utilization'
import StaffingRow from '@/components/features/StaffingRow'

export default async function StaffingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: rawPeriod } = await searchParams
  const period = rawPeriod === 'month' || rawPeriod === 'year' ? rawPeriod : 'week'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)
  if (!perms.canViewUtilization) redirect('/dashboard')

  const { start, end, weekCount } = getPeriodBounds(period)

  // ── Fetch everything in parallel ────────────────────────────────
  const [
    { data: allUsers },
    { data: allAssignments },
    { data: allStages },
    { data: weeklyHours },
    { data: allStageNotes },
  ] = await Promise.all([
    supabase.from('users').select('id, name, role, capacity_hours').in('role', ['analyst', 'consultant']).eq('active', true).order('name').limit(500),
    supabase
      .from('assignments')
      .select('id, user_id, project_id, role_label, allocation_pct, project:projects(id, name, status, kickoff_date, target_delivery_date)').limit(1000),
    supabase
      .from('project_stages')
      .select('id, project_id, stage, status'),
    supabase
      .from('weekly_hours')
      .select('user_id, project_id, hours_logged, week_start')
      .gte('week_start', start)
      .lte('week_start', end),
    supabase
      .from('stage_notes')
      .select('stage_id, value')
      .eq('field_key', 'expected_hours_per_week'),
  ])

  // ── Index helpers ───────────────────────────────────────────────
  type AssignmentRow = {
    id: string
    user_id: string
    project_id: string
    role_label: string
    allocation_pct: number
    project: { id: string; name: string; status: string; kickoff_date: string | null; target_delivery_date: string | null } | null
  }

  type StageRow  = { id: string; project_id: string; stage: string; status: string }
  type NoteRow   = { stage_id: string; value: string }
  type WeeklyRow = { user_id: string; project_id: string; hours_logged: number; week_start: string }
  type UserRow   = { id: string; name: string; role: string; capacity_hours: number }

  const assignmentsByUser: Record<string, AssignmentRow[]> = {}
  for (const a of (allAssignments ?? []) as unknown as AssignmentRow[]) {
    if (!assignmentsByUser[a.user_id]) assignmentsByUser[a.user_id] = []
    // Deduplicate: if this project already exists for this user, keep higher allocation
    const existing = assignmentsByUser[a.user_id].findIndex(x => x.project_id === a.project_id)
    if (existing >= 0) {
      if (a.allocation_pct > assignmentsByUser[a.user_id][existing].allocation_pct) {
        assignmentsByUser[a.user_id][existing] = a
      }
    } else {
      assignmentsByUser[a.user_id].push(a)
    }
  }

  const stagesByProject: Record<string, StageRow[]> = {}
  for (const s of (allStages ?? []) as StageRow[]) {
    if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = []
    stagesByProject[s.project_id].push(s)
  }

  // Build per-project hours overrides: projectId -> stageName -> h/week
  const stageIdToInfo: Record<string, { project_id: string; stage: string }> = {}
  for (const s of (allStages ?? []) as StageRow[]) stageIdToInfo[s.id] = { project_id: s.project_id, stage: s.stage }

  const hoursOverridesByProject: Record<string, Record<string, number>> = {}
  for (const n of (allStageNotes ?? []) as NoteRow[]) {
    const info = stageIdToInfo[n.stage_id]
    if (!info) continue
    if (!hoursOverridesByProject[info.project_id]) hoursOverridesByProject[info.project_id] = {}
    hoursOverridesByProject[info.project_id][info.stage] = parseFloat(n.value)
  }

  const hoursByUserProject: Record<string, number> = {}
  for (const h of (weeklyHours ?? []) as WeeklyRow[]) {
    const key = `${h.user_id}:${h.project_id}`
    hoursByUserProject[key] = (hoursByUserProject[key] ?? 0) + h.hours_logged
  }

  // ── Build utilization data per user ────────────────────────────
  const utilizationData: UserUtilizationData[] = ((allUsers ?? []) as UserRow[]).map(u => {
    const userAssignments = assignmentsByUser[u.id] ?? []

    const projects: ProjectBreakdown[] = userAssignments
      .filter(a => a.project !== null)
      .map(a => {
        const proj   = a.project!
        const stages = stagesByProject[proj.id] ?? []

        const inProgressStage = stages.find(s => s.status === 'in_progress')
        const currentStage    = inProgressStage?.stage ?? null

        const projHoursOverrides = hoursOverridesByProject[proj.id]
        const totalProjectHours  = currentStage
          ? (projHoursOverrides?.[currentStage] ?? STAGE_HOURS[currentStage] ?? 4)
          : 0
        const predictedHoursThisWeek = +(totalProjectHours * (a.allocation_pct / 100)).toFixed(1)

        const actualHoursPeriod = hoursByUserProject[`${u.id}:${proj.id}`] ?? 0

        const stageTimeline = (proj.kickoff_date && proj.target_delivery_date)
          ? buildStageTimeline(proj.kickoff_date, proj.target_delivery_date, stages, a.allocation_pct, projHoursOverrides)
          : []

        return {
          projectId:               proj.id,
          projectName:             proj.name,
          projectStatus:           proj.status,
          allocationPct:           a.allocation_pct,
          roleLabel:               a.role_label,
          currentStage,
          currentStageStatus:      inProgressStage?.status ?? null,
          predictedHoursThisWeek,
          actualHoursPeriod,
          stageTimeline,
          projectEndDate:          proj.target_delivery_date,
        }
      })

    const actualHours          = Object.entries(hoursByUserProject)
      .filter(([key]) => key.startsWith(`${u.id}:`))
      .reduce((sum, [, h]) => sum + h, 0)

    const predictedHoursPerWeek = +projects
      .reduce((sum, p) => sum + p.predictedHoursThisWeek, 0)
      .toFixed(1)

    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      actualHours,
      capacityHours: weekCount * (u.capacity_hours ?? CAPACITY_PER_WEEK),
      predictedHoursPerWeek,
      projects,
    }
  })

  // ── Summary stats ───────────────────────────────────────────────
  const avgActualPct = utilizationData.length
    ? Math.round(utilizationData.reduce((s, u) => s + (u.capacityHours > 0 ? (u.actualHours / u.capacityHours) * 100 : 0), 0) / utilizationData.length)
    : 0
  // Per-week capacity varies per user; derive it from the period capacity
  const avgPredictedPct = utilizationData.length
    ? Math.round(utilizationData.reduce((s, u) => {
        const capPerWeek = weekCount > 0 ? u.capacityHours / weekCount : 40
        return s + (capPerWeek > 0 ? (u.predictedHoursPerWeek / capPerWeek) * 100 : 0)
      }, 0) / utilizationData.length)
    : 0
  const overloadedCount = utilizationData.filter(u => {
    const capPerWeek = weekCount > 0 ? u.capacityHours / weekCount : 40
    return capPerWeek > 0 && (u.predictedHoursPerWeek / capPerWeek) * 100 >= 90
  }).length
  const availableCount = utilizationData.filter(u => {
    const capPerWeek = weekCount > 0 ? u.capacityHours / weekCount : 40
    return capPerWeek > 0 && (u.predictedHoursPerWeek / capPerWeek) * 100 < 50
  }).length

  const periodLabels: Record<string, string> = { week: 'This Week', month: 'This Month', year: 'This Year' }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-teal-100 hover:text-white">← Dashboard</Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">Staffing Matrix</h1>
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

          {/* ── Controls row ──────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            {/* Period selector */}
            <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
              {(['week', 'month', 'year'] as const).map(p => (
                <Link
                  key={p}
                  href={`/staffing?period=${p}`}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    period === p
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-500 hover:text-teal-900'
                  }`}
                >
                  {periodLabels[p]}
                </Link>
              ))}
            </div>

          </div>

          {/* ── Summary cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="Total Staff"       value={utilizationData.length.toString()} />
            <SummaryCard label="Avg Actual Util"   value={`${avgActualPct}%`}   sub={periodLabels[period]} />
            <SummaryCard label="Avg Predicted Util" value={`${avgPredictedPct}%`} sub="this week" />
            <SummaryCard label="Capacity Available" value={availableCount.toString()} sub="< 50% predicted" />
          </div>

          {/* ── Staff table ───────────────────────────────────────── */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold text-teal-900">Team Utilisation</h2>
              <p className="text-xs text-slate-400">
                Actual = logged hours · Predicted = estimated from active stage defaults
              </p>
            </div>
            <div className="divide-y">
              {utilizationData.map(u => (
                <StaffingRow key={u.userId} data={u} weekCount={weekCount} />
              ))}
            </div>
          </div>

          {/* ── Legend ───────────────────────────────────────────── */}
          <div className="flex items-center gap-6 text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-green-400 inline-block" /> &lt; 50%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-yellow-400 inline-block" /> 50–79%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-orange-400 inline-block" /> 80–99%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-red-400 inline-block" /> ≥ 100%</span>
            <span className="ml-2 text-slate-300">|</span>
            <span>◐ = In Progress · ● = Complete · ○ = Pending</span>
          </div>

        </div>
      </main>
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-teal-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
