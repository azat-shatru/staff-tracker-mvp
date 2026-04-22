'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { weekStart, toDateStr } from '@/lib/utilization'

export type TimesheetRow = {
  name:    string
  week_of: string
  project: string
  hours:   string
  rating:  string
}

export type TimesheetResult = {
  imported: number
  errors: { row: number; message: string }[]
}

/** Parse a "Week of" date in various formats and snap to that week's Monday */
function parseWeekOf(raw: string): string | null {
  const s = raw.trim().replace(/^week\s+of\s*/i, '')
  if (!s) return null

  let date: Date | null = null

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // YYYY-MM-DD
    date = new Date(s + 'T00:00:00')
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    // DD/MM/YYYY
    const [d, m, y] = s.split('/')
    date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`)
  } else {
    // Try JS Date parsing for "31 Mar 2026", "Mar 31, 2026", etc.
    const attempt = new Date(s)
    if (!isNaN(attempt.getTime())) date = attempt
  }

  if (!date || isNaN(date.getTime())) return null

  // Snap to the Monday of that week
  const day  = date.getDay()          // 0 = Sun, 1 = Mon …
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return toDateStr(date)
}

export async function processTimesheet(rows: TimesheetRow[]): Promise<TimesheetResult> {
  const supabase = await createClient()

  const [{ data: allUsers }, { data: allProjects }] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('projects').select('id, name').in('status', ['active', 'on_hold']),
  ])

  // Case-insensitive name → user lookup
  const userByName = new Map<string, { id: string }>()
  for (const u of (allUsers ?? []) as { id: string; name: string }[]) {
    userByName.set(u.name.toLowerCase().trim(), { id: u.id })
  }

  // Case-insensitive project name lookup
  const projectByName = new Map<string, string>()
  for (const p of (allProjects ?? []) as { id: string; name: string }[]) {
    projectByName.set(p.name.toLowerCase().trim(), p.id)
  }

  const defaultWeekStart = toDateStr(weekStart(new Date()))

  const errors:  { row: number; message: string }[] = []
  const upserts: {
    user_id:      string
    project_id:   string
    week_start:   string
    hours_logged: number
    rating:       number | null
  }[] = []

  rows.forEach((row, i) => {
    const rowNum = i + 2

    // Resolve user by name
    const userKey = row.name?.toLowerCase().trim() ?? ''
    const userRec = userByName.get(userKey)
    if (!userRec) {
      errors.push({ row: rowNum, message: `Name not found: "${row.name}"` })
      return
    }

    // Resolve project
    const projKey   = row.project?.toLowerCase().trim() ?? ''
    const projectId = projectByName.get(projKey)
    if (!projectId) {
      errors.push({ row: rowNum, message: `Project not found: "${row.project}"` })
      return
    }

    // Parse hours
    const hours = parseFloat(row.hours)
    if (isNaN(hours) || hours < 0) {
      errors.push({ row: rowNum, message: `Invalid hours: "${row.hours}"` })
      return
    }

    // Parse week
    const ws = row.week_of?.trim()
      ? parseWeekOf(row.week_of)
      : defaultWeekStart
    if (!ws) {
      errors.push({ row: rowNum, message: `Invalid week format: "${row.week_of}" — use DD/MM/YYYY, YYYY-MM-DD, or "31 Mar 2026"` })
      return
    }

    // Parse rating (0–7, optional)
    let rating: number | null = null
    if (row.rating?.trim()) {
      const r = parseInt(row.rating, 10)
      if (isNaN(r) || r < 0 || r > 7) {
        errors.push({ row: rowNum, message: `Invalid rating: "${row.rating}" — must be 0–7` })
        return
      }
      rating = r
    }

    upserts.push({
      user_id:      userRec.id,
      project_id:   projectId,
      week_start:   ws,
      hours_logged: hours,
      rating,
    })
  })

  if (upserts.length > 0) {
    await supabase
      .from('weekly_hours')
      .upsert(upserts, { onConflict: 'user_id,project_id,week_start' })

    // ── Auto-assign users to projects with equal allocation ──────────────────
    // Collect unique project → user pairs from this upload
    const projectUsers = new Map<string, Set<string>>()
    for (const u of upserts) {
      if (!projectUsers.has(u.project_id)) projectUsers.set(u.project_id, new Set())
      projectUsers.get(u.project_id)!.add(u.user_id)
    }

    const projectIds = [...projectUsers.keys()]

    type ExistingAssignment = { id: string; user_id: string; project_id: string; role_label: string; allocation_pct: number }

    const [{ data: existingAssignments }, { data: projectsWithPM }] = await Promise.all([
      supabase.from('assignments').select('id, user_id, project_id, role_label, allocation_pct').in('project_id', projectIds),
      supabase.from('projects').select('id, project_manager_id').in('id', projectIds),
    ])

    const pmByProject = new Map<string, string>()
    for (const p of (projectsWithPM ?? []) as { id: string; project_manager_id: string | null }[]) {
      if (p.project_manager_id) pmByProject.set(p.id, p.project_manager_id)
    }

    const assignmentsByProject = new Map<string, ExistingAssignment[]>()
    for (const a of (existingAssignments ?? []) as ExistingAssignment[]) {
      if (!assignmentsByProject.has(a.project_id)) assignmentsByProject.set(a.project_id, [])
      assignmentsByProject.get(a.project_id)!.push(a)
    }

    // Insert assignments for users not yet assigned (skip PM users)
    const newAssignments: { project_id: string; user_id: string; role_label: string; allocation_pct: number }[] = []
    for (const [projectId, userIds] of projectUsers) {
      const pmId = pmByProject.get(projectId)
      const existing = assignmentsByProject.get(projectId) ?? []
      const existingUserIds = new Set(existing.map(a => a.user_id))

      for (const userId of userIds) {
        if (userId === pmId) continue
        if (!existingUserIds.has(userId)) {
          newAssignments.push({ project_id: projectId, user_id: userId, role_label: '', allocation_pct: 0 })
        }
      }
    }

    if (newAssignments.length > 0) {
      await supabase.from('assignments').insert(newAssignments)
    }

    // Rebalance all non-PM assignments to equal allocation per project
    const { data: updatedAssignments } = await supabase
      .from('assignments')
      .select('id, user_id, project_id, role_label, allocation_pct')
      .in('project_id', projectIds)

    const allocationUpdates: { id: string; allocation_pct: number }[] = []
    for (const projectId of projectIds) {
      const pmId = pmByProject.get(projectId)
      const nonPmAssignments = ((updatedAssignments ?? []) as ExistingAssignment[])
        .filter(a => a.project_id === projectId && a.user_id !== pmId && a.role_label !== 'Project Manager')

      const n = nonPmAssignments.length
      if (n === 0) continue
      const equalPct = Math.round(100 / n)
      for (const a of nonPmAssignments) {
        allocationUpdates.push({ id: a.id, allocation_pct: equalPct })
      }
    }

    await Promise.all(
      allocationUpdates.map(u =>
        supabase.from('assignments').update({ allocation_pct: u.allocation_pct }).eq('id', u.id)
      )
    )
  }

  revalidatePath('/staffing')
  revalidatePath('/team')
  revalidatePath('/dashboard')
  return { imported: upserts.length, errors }
}

/** Sync assignments from all existing weekly_hours entries */
export async function syncAssignmentsFromHours(): Promise<{ assigned: number; error?: string }> {
  const supabase = await createClient()

  // Check caller is manager
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { assigned: 0, error: 'Not authenticated' }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'manager') return { assigned: 0, error: 'Permission denied' }

  // Fetch all hours entries that have a project_id
  const { data: hours } = await supabase
    .from('weekly_hours')
    .select('user_id, project_id')
    .not('project_id', 'is', null)

  if (!hours || hours.length === 0) return { assigned: 0 }

  type ExistingAssignment = { id: string; user_id: string; project_id: string; role_label: string; allocation_pct: number }

  // Collect unique project → user pairs
  const projectUsers = new Map<string, Set<string>>()
  for (const h of hours as { user_id: string; project_id: string }[]) {
    if (!projectUsers.has(h.project_id)) projectUsers.set(h.project_id, new Set())
    projectUsers.get(h.project_id)!.add(h.user_id)
  }

  const projectIds = [...projectUsers.keys()]

  const [{ data: existingAssignments }, { data: projectsWithPM }] = await Promise.all([
    supabase.from('assignments').select('id, user_id, project_id, role_label, allocation_pct').in('project_id', projectIds),
    supabase.from('projects').select('id, project_manager_id').in('id', projectIds),
  ])

  const pmByProject = new Map<string, string>()
  for (const p of (projectsWithPM ?? []) as { id: string; project_manager_id: string | null }[]) {
    if (p.project_manager_id) pmByProject.set(p.id, p.project_manager_id)
  }

  const assignmentsByProject = new Map<string, ExistingAssignment[]>()
  for (const a of (existingAssignments ?? []) as ExistingAssignment[]) {
    if (!assignmentsByProject.has(a.project_id)) assignmentsByProject.set(a.project_id, [])
    assignmentsByProject.get(a.project_id)!.push(a)
  }

  const newAssignments: { project_id: string; user_id: string; role_label: string; allocation_pct: number }[] = []
  for (const [projectId, userIds] of projectUsers) {
    const pmId = pmByProject.get(projectId)
    const existing = assignmentsByProject.get(projectId) ?? []
    const existingUserIds = new Set(existing.map(a => a.user_id))

    for (const userId of userIds) {
      if (userId === pmId) continue
      if (!existingUserIds.has(userId)) {
        newAssignments.push({ project_id: projectId, user_id: userId, role_label: '', allocation_pct: 0 })
      }
    }
  }

  if (newAssignments.length > 0) {
    await supabase.from('assignments').insert(newAssignments)
  }

  // Rebalance all non-PM assignments to equal allocation
  const { data: updatedAssignments } = await supabase
    .from('assignments')
    .select('id, user_id, project_id, role_label, allocation_pct')
    .in('project_id', projectIds)

  const allocationUpdates: { id: string; allocation_pct: number }[] = []
  for (const projectId of projectIds) {
    const pmId = pmByProject.get(projectId)
    const nonPmAssignments = ((updatedAssignments ?? []) as ExistingAssignment[])
      .filter(a => a.project_id === projectId && a.user_id !== pmId && a.role_label !== 'Project Manager')

    const n = nonPmAssignments.length
    if (n === 0) continue
    const equalPct = Math.round(100 / n)
    for (const a of nonPmAssignments) {
      allocationUpdates.push({ id: a.id, allocation_pct: equalPct })
    }
  }

  await Promise.all(
    allocationUpdates.map(u =>
      supabase.from('assignments').update({ allocation_pct: u.allocation_pct }).eq('id', u.id)
    )
  )

  revalidatePath('/staffing')
  revalidatePath('/team')
  revalidatePath('/dashboard')
  return { assigned: newAssignments.length }
}
