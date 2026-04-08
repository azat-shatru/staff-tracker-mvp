'use server'

import { createClient } from '@/lib/supabase/server'

export type EmployeeDetail = {
  userId:     string
  name:       string
  role:       string
  totalHours: number
  projects:   { projectId: string; name: string; hours: number }[]
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

  const { data: rows, error } = await supabase
    .from('weekly_hours')
    .select('user_id, project_id, hours_logged, users(id, name, role), projects(id, name)')
    .gte('week_start', startDate)
    .lte('week_start', endDate)
    .is('leave_type', null)   // work hours only

  if (error) return { error: error.message }

  type Row = {
    user_id:      string
    project_id:   string | null
    hours_logged: number
    users:        { id: string; name: string; role: string } | null
    projects:     { id: string; name: string } | null
  }

  const empMap:  Record<string, EmployeeDetail> = {}
  const projMap: Record<string, ProjectDetail>  = {}

  for (const raw of (rows ?? []) as unknown as Row[]) {
    const uid    = raw.user_id
    const pid    = raw.project_id ?? 'unassigned'
    const hours  = raw.hours_logged ?? 0
    const uName  = raw.users?.name ?? 'Unknown'
    const uRole  = raw.users?.role ?? ''
    const pName  = raw.projects?.name ?? 'No project'

    if (!empMap[uid]) empMap[uid] = { userId: uid, name: uName, role: uRole, totalHours: 0, projects: [] }
    empMap[uid].totalHours += hours
    const ep = empMap[uid].projects.find(p => p.projectId === pid)
    if (ep) { ep.hours += hours }
    else    { empMap[uid].projects.push({ projectId: pid, name: pName, hours }) }

    if (!projMap[pid]) projMap[pid] = { projectId: pid, name: pName, totalHours: 0 }
    projMap[pid].totalHours += hours
  }

  const byEmployee = Object.values(empMap).sort((a, b) => b.totalHours - a.totalHours)
  const byProject  = Object.values(projMap).sort((a, b) => b.totalHours - a.totalHours)
  const totalHours = byEmployee.reduce((s, e) => s + e.totalHours, 0)

  return { data: { byEmployee, byProject, totalHours, periodLabel } }
}
