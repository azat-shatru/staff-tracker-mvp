export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getPermissions } from '@/lib/permissions'
import EmployeeList from '@/components/features/EmployeeList'
import TimesheetUpload from '@/components/features/TimesheetUpload'
import UtilizationDownload from '@/components/features/UtilizationDownload'
import type { Role } from '@/lib/types'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)

  const { data: allUsers } = await supabase
    .from('users')
    .select('*')
    .order('name')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-teal-100 hover:text-white">← Dashboard</Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">Employees</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-teal-100">
            {currentUser?.name ?? user?.email}
            <span className="ml-1.5 px-1.5 py-0.5 bg-teal-600 text-teal-100 rounded text-xs capitalize">
              {currentUser?.role}
            </span>
          </span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="border-teal-400 text-teal-100 hover:bg-teal-600 hover:border-teal-300 bg-transparent">Sign out</Button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold text-teal-900">Team Directory</h2>
              <p className="text-sm text-slate-500 mt-0.5">{(allUsers ?? []).length} employees</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/log-hours"
                className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 transition-colors"
              >
                + Log Hours
              </Link>
              {perms.canManagePoc && <TimesheetUpload />}
              {perms.canViewUtilization && <UtilizationDownload />}
            </div>
          </div>
          <EmployeeList
            users={allUsers ?? []}
            currentUserId={user.id}
            canManage={perms.canManageEmployees}
          />
        </div>
      </main>
    </div>
  )
}
