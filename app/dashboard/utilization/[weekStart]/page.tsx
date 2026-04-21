export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import { getPermissions } from '@/lib/permissions'
import { fetchUtilizationDetail } from '@/app/dashboard/utilization-actions'
import UtilizationDetail from '@/components/features/UtilizationDetail'
import type { Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'

type Period = 'week' | 'month' | 'year'

export default async function UtilizationDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ weekStart: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { weekStart }   = await params
  const { period: raw } = await searchParams
  const period: Period  = raw === 'month' || raw === 'year' ? raw : 'week'

  // Validate weekStart is a real date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)
  if (!perms.canViewUtilization) redirect('/dashboard')

  const result = await fetchUtilizationDetail(weekStart, period)
  const data = result.data ?? null

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'week',  label: 'Week'  },
    { value: 'month', label: 'Month' },
    { value: 'year',  label: 'Year'  },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-teal-100 hover:text-white">
            ← Dashboard
          </Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">Utilization Detail</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-teal-100">
            {currentUser?.name ?? user?.email}
            <span className="ml-1.5 px-1.5 py-0.5 bg-teal-600 text-teal-100 rounded text-xs">
              {ROLE_DISPLAY[currentUser?.role ?? ''] ?? currentUser?.role ?? ''}
            </span>
          </span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit"
              className="border-teal-400 text-teal-100 hover:bg-teal-600 hover:border-teal-300 bg-transparent">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Period + summary */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-teal-900">
                {data?.periodLabel ?? 'Utilization Detail'}
              </h2>
              {data && (() => {
                const logged   = data.byEmployee.filter(e => !e.noEntry).length
                const onLeave  = data.byEmployee.filter(e =>  e.noEntry).length
                return (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {data.totalHours.toFixed(1)}h logged · {logged} active{' '}
                    {onLeave > 0 && <span className="text-slate-400">· {onLeave} on leave / no entry</span>}
                    {data.byProject.length > 0 && ` · ${data.byProject.length} project${data.byProject.length !== 1 ? 's' : ''}`}
                  </p>
                )
              })()}
            </div>

            {/* Period tabs */}
            <div className="flex gap-1 bg-white border rounded-lg p-1">
              {PERIODS.map(p => (
                <Link
                  key={p.value}
                  href={`/dashboard/utilization/${weekStart}?period=${p.value}`}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    period === p.value
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Error state */}
          {result.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">
                Failed to load utilization data: {result.error}
              </p>
            </div>
          )}

          {/* Interactive detail (view toggle + tables) */}
          {data && <UtilizationDetail data={data} />}

        </div>
      </main>
    </div>
  )
}
