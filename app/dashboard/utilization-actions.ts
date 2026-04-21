'use server'

import { createClient } from '@/lib/supabase/server'

export type EmployeeDetail = {
  userId:            string
  name:              string
  role:              string
  totalHours:        number
  effectiveCapacity: number
  projects:          { projectId: string; name: string; hours: number }[]
  noEntry:           boolean   // true = active employee with zero logs this period
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
    // Only active employees
    supabase
      .from('users')
      .select('id, name, role, capacity_hours')
      .in('role', ['analyst', 'consultant'])
      .eq('active', true),
  ])

  if (error) return { error: error.message }

  const capacityByUser: Record<string, number> = {}
  const nameByUser:     Record<string, string> = {}
  const roleByUser:     Record<string, string> = {}

  for (const u of userCapRows ?? []) {
    capacityByUser[u.id] = u.capacity_hours ?? 40
    nameByUser[u.id]     = u.name
    roleByUser[u.id]     = u.role
  }

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
    const uRole = raw.users?.role ?? ''
    if (!['analyst', 'consultant'].includes(uRole)) continue
    const uid   = raw.user_id
    const pid   = raw.project_id ?? 'unassigned'
    const hours = raw.hours_logged ?? 0
    const uName = raw.users?.name ?? 'Unknown'
    const pName = raw.projects?.name ?? 'No project'

    if (!activeWeeksMap[uid]) activeWeeksMap[uid] = new Set()
    activeWeeksMap[uid].add(raw.week_start)

    if (!empMap[uid]) empMap[uid] = { userId: uid, name: uName, role: uRole, totalHours: 0, effectiveCapacity: 0, projects: [], noEntry: false }
    empMap[uid].totalHours += hours
    const ep = empMap[uid].projects.find(p => p.projectId === pid)
    if (ep) { ep.hours += hours }
    else    { empMap[uid].projects.push({ projectId: pid, name: pName, hours }) }

    if (!projMap[pid]) projMap[pid] = { projectId: pid, name: pName, totalHours: 0 }
    projMap[pid].totalHours += hours
  }

  // Compute effective capacity
  for (const uid of Object.keys(empMap)) {
    const activeWeeks = activeWeeksMap[uid]?.size ?? 0
    const leaveHours  = leaveHoursMap[uid] ?? 0
    empMap[uid].effectiveCapacity = Math.max(activeWeeks * (capacityByUser[uid] ?? 40) - leaveHours, 0)
  }

  // Add active employees who logged nothing this period — show as "On Leave"
  for (const u of userCapRows ?? []) {
    if (!empMap[u.id]) {
      empMap[u.id] = {
        userId: u.id, name: u.name, role: u.role,
        totalHours: 0, effectiveCapacity: 0,
        projects: [], noEntry: true,
      }
    }
  }

  // Sort: employees with hours first (by hours desc), then no-entry employees (alphabetically)
  const withHours  = Object.values(empMap).filter(e => !e.noEntry).sort((a, b) => b.totalHours - a.totalHours)
  const noEntries  = Object.values(empMap).filter(e =>  e.noEntry).sort((a, b) => a.name.localeCompare(b.name))
  const byEmployee = [...withHours, ...noEntries]

  const byProject  = Object.values(projMap).sort((a, b) => b.totalHours - a.totalHours)
  const totalHours = withHours.reduce((s, e) => s + e.totalHours, 0)

  return { data: { byEmployee, byProject, totalHours, periodLabel } }
}
