import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPermissions } from '@/lib/permissions'
import { weekStart, toDateStr } from '@/lib/utilization'
import type { Role } from '@/lib/types'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)
  if (!perms.canViewUtilization) return new NextResponse('Forbidden', { status: 403 })

  const weeksParam = parseInt(req.nextUrl.searchParams.get('weeks') ?? '4')
  const weeks = Math.min(Math.max(isNaN(weeksParam) ? 4 : weeksParam, 1), 52)

  const today      = new Date()
  const prevMonday = weekStart(today)
  prevMonday.setDate(prevMonday.getDate() - 7)

  // Build array of week-start strings, oldest first
  const mondays = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(prevMonday)
    d.setDate(d.getDate() - (weeks - 1 - i) * 7)
    return toDateStr(d)
  })

  const [{ data: allUsers }, { data: allHours }] = await Promise.all([
    supabase.from('users').select('id, name, capacity_hours').in('role', ['analyst', 'consultant']).order('name').limit(500),
    supabase
      .from('weekly_hours')
      .select('user_id, hours_logged, week_start, leave_type')
      .gte('week_start', mondays[0])
      .lte('week_start', mondays[mondays.length - 1]),
  ])

  type HRow = { user_id: string; hours_logged: number; week_start: string; leave_type: string | null }
  type URow = { id: string; name: string; capacity_hours: number | null }

  // Group by (user_id, week_start)
  const bucket: Record<string, { workHours: number; leaveDays: number; paidLeaveDays: number; sickLeaveDays: number }> = {}
  for (const h of (allHours ?? []) as HRow[]) {
    const key = `${h.user_id}::${h.week_start}`
    if (!bucket[key]) bucket[key] = { workHours: 0, leaveDays: 0, paidLeaveDays: 0, sickLeaveDays: 0 }
    if (h.leave_type === 'paid_leave') {
      bucket[key].leaveDays++
      bucket[key].paidLeaveDays++
    } else if (h.leave_type === 'sick_leave') {
      bucket[key].leaveDays++
      bucket[key].sickLeaveDays++
    } else {
      bucket[key].workHours += h.hours_logged
    }
  }

  function escapeCSV(val: string): string {
    if (/[",\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`
    return val
  }

  const csvRows: string[] = [
    'Employee,Week Start,Paid Leave Days,Sick Leave Days,Total Leave Days,Leave Hours,Expected Work Hours,Actual Work Hours,Utilization %',
  ]

  for (const u of (allUsers ?? []) as URow[]) {
    const cap = u.capacity_hours ?? 40
    for (const weekStr of mondays) {
      const key  = `${u.id}::${weekStr}`
      const data = bucket[key] ?? { workHours: 0, leaveDays: 0, paidLeaveDays: 0, sickLeaveDays: 0 }
      const leaveHours    = data.leaveDays * 8
      const effectiveCap  = Math.max(cap - leaveHours, 0)
      const utilPct       = effectiveCap > 0 ? Math.round((data.workHours / effectiveCap) * 100) : 0
      csvRows.push(
        `${escapeCSV(u.name)},${weekStr},${data.paidLeaveDays},${data.sickLeaveDays},${data.leaveDays},${leaveHours},${effectiveCap},${data.workHours},${utilPct}%`
      )
    }
  }

  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="utilization_${weeks}w.csv"`,
    },
  })
}
