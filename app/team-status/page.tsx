export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPermissions } from '@/lib/permissions'
import type { Role } from '@/lib/types'

import TeamStatusGrid from '@/components/features/TeamStatusGrid'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function TeamStatusPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)
  if (!perms.canViewTeamStatus) redirect('/dashboard')

  const today = todayStr()

  const [
    { data: teamMembers },
    { data: todayLogs },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, role, capacity_hours')
      .in('role', ['analyst', 'consultant'])
      .eq('active', true)
      .order('name'),

    supabase
      .from('daily_logs')
      .select('id, user_id, status, submitted_at')
      .eq('log_date', today),
  ])

  // Fetch slots for all today's logs
  const logIds = (todayLogs ?? []).map((l: { id: string }) => l.id)
  const { data: todaySlots } = logIds.length > 0
    ? await supabase
        .from('daily_log_slots')
        .select('log_id, start_min, end_min, project_id, phase, project:projects(id, name)')
        .in('log_id', logIds)
    : { data: [] }

  // Build per-user slot map
  const logIdByUser: Record<string, string> = {}
  const statusByUser: Record<string, string> = {}
  const submittedByUser: Record<string, string | null> = {}
  for (const l of todayLogs ?? []) {
    logIdByUser[l.user_id]       = l.id
    statusByUser[l.user_id]      = l.status
    submittedByUser[l.user_id]   = l.submitted_at
  }

  type SlotEntry = { start_min: number; end_min: number; project_id: string | null; phase: string | null; project?: { id: string; name: string } | null }
  const slotsByLogId: Record<string, SlotEntry[]> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const raw of (todaySlots ?? []) as any[]) {
    const s: SlotEntry = {
      start_min:  raw.start_min,
      end_min:    raw.end_min,
      project_id: raw.project_id ?? null,
      phase:      raw.phase ?? null,
      project: Array.isArray(raw.project)
        ? (raw.project[0] ? { id: raw.project[0].id, name: raw.project[0].name } : null)
        : raw.project ?? null,
    }
    if (!slotsByLogId[raw.log_id]) slotsByLogId[raw.log_id] = []
    slotsByLogId[raw.log_id].push(s)
  }

  const members = (teamMembers ?? []).map((m: { id: string; name: string; role: string; capacity_hours: number }) => {
    const logId    = logIdByUser[m.id]
    const status   = statusByUser[m.id] ?? 'not_logged'
    const submitted = submittedByUser[m.id] ?? null
    const slots    = logId ? (slotsByLogId[logId] ?? []) : []
    const isOOO    = status === 'OOO'

    const committedHrs = isOOO ? 0 : slots
      .filter(s => s.project_id)
      .reduce((sum, s) => sum + (s.end_min - s.start_min) / 60, 0)

    const availableHrs = isOOO ? 0 : Math.max(0, (m.capacity_hours ?? 8) - committedHrs)

    const projectsToday = isOOO ? [] : Array.from(
      new Map(
        slots
          .filter(s => s.project_id)
          .map(s => [s.project_id, { id: s.project_id!, name: s.project?.name ?? 'Unknown', phase: s.phase }])
      ).values()
    )

    return {
      id:           m.id,
      name:         m.name,
      role:         m.role,
      status,
      submitted,
      committedHrs,
      availableHrs,
      projectsToday,
    }
  })

  return <TeamStatusGrid members={members} today={today} currentUserId={user.id} />
}
