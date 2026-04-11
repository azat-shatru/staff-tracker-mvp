'use server'

import { createClient } from '@/lib/supabase/server'

export type EmployeeDetail = {
  userId:            string
  name:              string
  role:              string
  totalHours:        number
  effectiveCapacity: number   // active weeks × capacity_hours − leave hours
  projects:          { projectId: string; name: string; hours: number }[]
}

export type ProjectDetail = {
  projectId:  string
  name:       string
  totalHours: number
}

export type UtilizationDetail = {
  byEmployee:  EmployeeDetail[]
  byProject:   ProjectDetail[]
  totalHours:  number
  periodLabel: string
}

export async function fetchUtilizationDetail(
  weekStart: string,
  period: 'week' | 'month' | 'year'
): Promise<{ data?: UtilizationDetail; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const ref = new Date(weekStart)
  let startDate: string
  let endDate:   string
  let periodLabel: string

  if (period === 'week') {
    startDate   = weekStart
    endDate     = weekStart
    periodLabel = `Week of ${ref.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  } else if (period === 'month') {
    const s = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    startDate   = s.toISOString().split('T')[0]
    endDate     = e.toISOString().split('T')[0]
    periodLabel = ref.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  } else {
    startDate   = `${ref.getFullYear()}-01-01`
    endDate     = `${ref.getFullYear()}-12-31`
    periodLabel = String(ref.getFullYear())
  }

  const [
    { data: rows,      error },
    { data: leaveRows         },
    { data: userCapRows       },
  ] = await Promise.all([
    supabase
      .from('weekly_hours')
      .select('user_id, project_id, hours_logged, week_start, users(id, name, role), projects(id, name)')
      .gte('week_start', startDate)
      .lte('week_start', endDate)
      .is('leave_type', null),
    supabase
      .from('weekly_hours')
      .select('user_id, hours_logged, week_start')
      .gte('week_start', startDate)
      .lte('week_start', endDate)
      .not('leave_type', 'is', null),
    supabase
      .from('users')
      .select('id, capacity_hours')
      .in('role', ['analyst', 'consultant']),
  ])

  if (error) return { error: error.message }

  // Per-user capacity and leave tracking
  const capacityByUser: Record<string, number> = {}
  for (const u of userCapRows ?? []) capacityByUser[u.id] = u.capacity_hours ?? 40

  const leaveHoursMap:  Record<string, number>      = {}
  const activeWeeksMap: Record<string, Set<string>> = {}

  for (const l of leaveRows ?? []) {
    leaveHoursMap[l.user_id] = (leaveHoursMap[l.user_id] ?? 0) + l.hours_logged
    if (!activeWeeksMap[l.user_id]) activeWeeksMap[l.user_id] = new Set()
    activeWeeksMap[l.user_id].add(l.week_start)
  }

  type Row = {
    user_id:      string
    project_id:   string | null
    hours_logged: number
    week_start:   string
    users:        { id: string; name: string; role: string } | null
    projects:     { id: string; name: string } | null
  }

  const empMap:  Record<string, EmployeeDetail> = {}
  const projMap: Record<string, ProjectDetail>  = {}

  for (const raw of (rows ?? []) as unknown as Row[]) {
    const uRole  = raw.users?.role ?? ''
    if (!['analyst', 'consultant'].includes(uRole)) continue
    const uid    = raw.user_id
    const pid    = raw.project_id ?? 'unassigned'
    const hours  = raw.hours_logged ?? 0
    const uName  = raw.users?.name ?? 'Unknown'
    const pName  = raw.projects?.name ?? 'No project'

    if (!activeWeeksMap[uid]) activeWeeksMap[uid] = new Set()
    activeWeeksMap[uid].add(raw.week_start)

    if (!empMap[uid]) empMap[uid] = { userId: uid, name: uName, role: uRole, totalHours: 0, effectiveCapacity: 0, projects: [] }
    empMap[uid].totalHours += hours
    const ep = empMap[uid].projects.find(p => p.projectId === pid)
    if (ep) { ep.hours += hours }
    else    { empMap[uid].projects.push({ projectId: pid, name: pName, hours }) }

    if (!projMap[pid]) projMap[pid] = { projectId: pid, name: pName, totalHours: 0 }
    projMap[pid].totalHours += hours
  }

  // Compute effective capacity per employee
  for (const uid of Object.keys(empMap)) {
    const activeWeeks = activeWeeksMap[uid]?.size ?? 0
    const leaveHours  = leaveHoursMap[uid] ?? 0
    empMap[uid].effectiveCapacity = Math.max(activeWeeks * (capacityByUser[uid] ?? 40) - leaveHours, 0)
  }

  const byEmployee = Object.values(empMap).sort((a, b) => b.totalHours - a.totalHours)
  const byProject  = Object.values(projMap).sort((a, b) => b.totalHours - a.totalHours)
  const totalHours = byEmployee.reduce((s, e) => s + e.totalHours, 0)

  return { data: { byEmployee, byProject, totalHours, periodLabel } }
}
