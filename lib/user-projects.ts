import type { SupabaseClient } from '@supabase/supabase-js'

export type UserProject = { id: string; name: string; status: string; created_at: string }

/**
 * Returns the de-duplicated set of projects a user is considered "on":
 *   1. Active formal assignments (assignments.end_date is null or in the future)
 *   2. Any project they have logged weekly hours against in the past 4 weeks
 *
 * Archived projects are excluded. Result is sorted alphabetically.
 * This is the single source of truth used across all pages.
 */
export async function getUserProjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  today: string,          // 'YYYY-MM-DD'
): Promise<UserProject[]> {
  const fourWeeksAgo = (() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 28)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const [assignmentsResult, hoursResult] = await Promise.all([
    // Source 1: formal assignments
    supabase
      .from('assignments')
      .select('project:projects(id, name, status, created_at)')
      .eq('user_id', userId)
      .or(`end_date.is.null,end_date.gte.${today}`),

    // Source 2: projects logged against in the last 4 weeks
    supabase
      .from('weekly_hours')
      .select('project:projects(id, name, status, created_at)')
      .eq('user_id', userId)
      .not('project_id', 'is', null)
      .gte('week_start', fourWeeksAgo),
  ])

  const seen  = new Set<string>()
  const projects: UserProject[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addProject(raw: any) {
    const p = Array.isArray(raw) ? raw[0] : raw
    if (!p || typeof p !== 'object' || !p.id) return
    if (p.status === 'archived') return
    if (seen.has(p.id)) return
    seen.add(p.id)
    projects.push({ id: p.id as string, name: p.name as string, status: p.status as string, created_at: (p.created_at ?? '') as string })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of ((assignmentsResult.data ?? []) as any[])) addProject(row.project)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of ((hoursResult.data ?? []) as any[])) addProject(row.project)

  return projects.sort((a, b) => a.name.localeCompare(b.name))
}
