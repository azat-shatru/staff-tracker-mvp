export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPermissions } from '@/lib/permissions'
import type { Role } from '@/lib/types'
import { getUserProjects } from '@/lib/user-projects'
import DailyLogForm from '@/components/features/DailyLogForm'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nDaysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function DailyLogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, name, role, capacity_hours')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)
  if (!perms.canUseDailyLog) redirect('/dashboard')

  const today   = todayStr()
  const weekAgo = nDaysAgoStr(6)

  // Batch 1 — independent queries
  const [
    { data: todayLog },
    { data: weekLogs },
    myProjects,
  ] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .maybeSingle(),

    supabase
      .from('daily_logs')
      .select('id, log_date, status, submitted_at')
      .eq('user_id', user.id)
      .gte('log_date', weekAgo)
      .order('log_date', { ascending: false }),

    getUserProjects(supabase, user.id, today),
  ])

  // Batch 2 — dependent on todayLog id and weekLogs ids
  const weekLogIds = (weekLogs ?? []).map((l: { id: string }) => l.id)

  const [todaySlotsResult, weekSlotsResult] = await Promise.all([
    todayLog?.id
      ? supabase
          .from('daily_log_slots')
          .select('start_min, end_min, project_id, phase, priority, deliverable, project:projects(id, name)')
          .eq('log_id', todayLog.id)
          .order('start_min')
      : Promise.resolve({ data: [] }),

    weekLogIds.length > 0
      ? supabase
          .from('daily_log_slots')
          .select('log_id, start_min, end_min, project_id, phase, priority, deliverable, project:projects(id, name)')
          .in('log_id', weekLogIds)
      : Promise.resolve({ data: [] }),
  ])

  // Supabase returns joined fields as arrays; normalise to single objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normProject(p: any) {
    if (!p) return null
    const obj = Array.isArray(p) ? p[0] : p
    return obj ? { id: obj.id as string, name: obj.name as string } : null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todaySlotsNorm = (todaySlotsResult.data ?? []).map((s: any) => ({
    start_min:   s.start_min  as number,
    end_min:     s.end_min    as number,
    project_id:  (s.project_id  ?? null) as string | null,
    phase:       (s.phase       ?? null) as string | null,
    priority:    (s.priority    ?? null) as number | null,
    deliverable: (s.deliverable ?? false) as boolean,
    project:     normProject(s.project),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weekSlotsNorm = (weekSlotsResult.data ?? []).map((s: any) => ({
    log_id:      s.log_id     as string,
    start_min:   s.start_min  as number,
    end_min:     s.end_min    as number,
    project_id:  (s.project_id  ?? null) as string | null,
    phase:       (s.phase       ?? null) as string | null,
    priority:    (s.priority    ?? null) as number | null,
    deliverable: (s.deliverable ?? false) as boolean,
    project:     normProject(s.project),
  }))

  return (
    <DailyLogForm
      currentUserName={currentUser?.name ?? 'You'}
      today={today}
      todayLog={todayLog ?? null}
      todaySlots={todaySlotsNorm}
      myProjects={myProjects}
      weekLogs={(weekLogs ?? []) as { id: string; log_date: string; status: string; submitted_at: string | null }[]}
      weekSlots={weekSlotsNorm}
    />
  )
}
