export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getPermissions } from '@/lib/permissions'
import type { Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'
import HolidayUpload from '@/components/features/HolidayUpload'
import { clearHolidayYearAction } from './actions'

type HolidayRow = { id: string; holiday_date: string; name: string }

export default async function HolidaysPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)
  if (!perms.canManageHolidays) redirect('/dashboard')

  const { data: holidays } = await supabase
    .from('holidays')
    .select('id, holiday_date, name')
    .order('holiday_date', { ascending: true })

  // Group by year
  const byYear: Record<string, HolidayRow[]> = {}
  for (const h of (holidays ?? []) as HolidayRow[]) {
    const year = h.holiday_date.slice(0, 4)
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(h)
  }
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))

  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-teal-100 hover:text-white">← Dashboard</Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">Holiday Calendar</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-teal-100">
            {currentUser?.name ?? user?.email}
            <span className="ml-1.5 px-1.5 py-0.5 bg-teal-600 text-teal-100 rounded text-xs">
              {ROLE_DISPLAY[currentUser?.role ?? ''] ?? currentUser?.role ?? ''}
            </span>
          </span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="border-teal-400 text-teal-100 hover:bg-teal-600 hover:border-teal-300 bg-transparent">Sign out</Button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold text-teal-900">Company Holidays</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Each holiday adds <span className="font-medium">8h</span> to both sides of utilization
                for anyone who logged hours that week. Upload replaces the whole year.
              </p>
            </div>
            <HolidayUpload />
          </div>

          <div className="bg-white rounded-lg border p-4 text-xs text-slate-500">
            Expected columns: <span className="font-medium text-slate-700">SL.No. · Holiday · Date · Day</span>
            {' '}(a title row above the header is fine). Duplicate dates are ignored.
            Years with no list are treated as having no holidays.
          </div>

          {years.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-sm text-slate-400">
              No holidays uploaded yet.
            </div>
          ) : (
            years.map(year => (
              <div key={year} className="bg-white rounded-lg border overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-teal-900">
                    {year} <span className="text-slate-400 font-normal">· {byYear[year].length} holidays</span>
                  </h3>
                  <form action={clearHolidayYearAction}>
                    <input type="hidden" name="year" value={year} />
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      Clear {year}
                    </button>
                  </form>
                </div>
                <div className="divide-y">
                  {byYear[year].map(h => (
                    <div key={h.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="text-teal-900">{h.name}</span>
                      <span className="text-slate-500">{fmt(h.holiday_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}
