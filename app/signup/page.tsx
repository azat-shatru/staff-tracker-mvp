import { createAdminClient } from '@/lib/supabase/admin'
import SignupForm from './SignupForm'

const ROLES = [
  { value: 'analyst',    label: 'Analyst' },
  { value: 'consultant', label: 'Consultant/AC' },
  { value: 'manager',    label: 'Manager' },
  { value: 'director',   label: 'Director' },
  { value: 'executive',  label: 'Executive' },
]

export default async function SignupPage() {
  const admin = createAdminClient()
  const { data: users } = await admin
    .from('users')
    .select('id, name, role')
    .order('name')

  const managers = ((users ?? []) as { id: string; name: string; role: string }[])
    .filter(u => ['manager', 'director', 'executive'].includes(u.role))

  return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-50 dark:bg-slate-900 py-10">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-sm border dark:border-slate-700 w-full max-w-lg">
        <h1 className="text-2xl font-semibold text-teal-900 dark:text-teal-300 mb-1">Create Account</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Sign up to access Staff Tracker</p>
        <SignupForm roles={ROLES} managers={managers} />
      </div>
    </div>
  )
}
