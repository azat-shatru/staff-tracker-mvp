'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { weekStart, toDateStr } from '@/lib/utilization'

export type TimesheetRow = {
  email: string
  project_name: string
  week_start: string   // YYYY-MM-DD, optional — defaults to last Monday
  hours: string        // numeric string
}

export type TimesheetResult = {
  imported: number
  errors: { row: number; message: string }[]
}

export async function processTimesheet(rows: TimesheetRow[]): Promise<TimesheetResult> {
  const supabase = await createClient()

  // Pre-fetch all users and active projects once
  const [{ data: allUsers }, { data: allProjects }] = await Promise.all([
    supabase.from('users').select('id, email'),
    supabase.from('projects').select('id, name').in('status', ['active', 'on_hold']),
  ])

  const userByEmail = Object.fromEntries(
    (allUsers ?? []).map((u: { id: string; email: string }) => [u.email.toLowerCase().trim(), u.id])
  )
  const projectByName = Object.fromEntries(
    (allProjects ?? []).map((p: { id: string; name: string }) => [p.name.toLowerCase().trim(), p.id])
  )

  const defaultWeekStart = toDateStr(weekStart(new Date()))

  const errors: { row: number; message: string }[] = []
  const upserts: { user_id: string; project_id: string; week_start: string; hours_logged: number }[] = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // 1-indexed, skip header

    const userId = userByEmail[row.email?.toLowerCase().trim() ?? '']
    if (!userId) {
      errors.push({ row: rowNum, message: `Email not found: "${row.email}"` })
      return
    }

    const projectId = projectByName[row.project_name?.toLowerCase().trim() ?? '']
    if (!projectId) {
      errors.push({ row: rowNum, message: `Project not found: "${row.project_name}"` })
      return
    }

    const hours = parseFloat(row.hours)
    if (isNaN(hours) || hours < 0) {
      errors.push({ row: rowNum, message: `Invalid hours value: "${row.hours}"` })
      return
    }

    const ws = row.week_start?.trim() || defaultWeekStart
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) {
      errors.push({ row: rowNum, message: `Invalid week_start format (expected YYYY-MM-DD): "${ws}"` })
      return
    }

    upserts.push({ user_id: userId, project_id: projectId, week_start: ws, hours_logged: hours })
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
