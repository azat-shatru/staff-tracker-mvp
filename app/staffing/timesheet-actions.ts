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
  }

  revalidatePath('/staffing')
  revalidatePath('/team')
  revalidatePath('/dashboard')
  return { imported: upserts.length, errors }
}
