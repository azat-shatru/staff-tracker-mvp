'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signup } from './actions'
import { Button } from '@/components/ui/button'

const TEAMS = ['Insights', 'UST', 'SV Team', 'Programming', 'BA', 'Fielding', 'Management']

interface Props {
  roles:    { value: string; label: string }[]
  managers: { id: string; name: string; role: string }[]
}

export default function SignupForm({ roles, managers }: Props) {
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [selectedRole,      setSelectedRole]      = useState('analyst')

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await signup(formData)
    setLoading(false)
    if (result?.error)              setError(result.error)
    if (result?.needsConfirmation)  setNeedsConfirmation(true)
  }

  if (needsConfirmation) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800 mb-1">Check your email</p>
          <p className="text-sm text-green-700">
            A confirmation link has been sent to your email address. Click it to activate your account.
          </p>
        </div>
        <Link href="/login" className="block text-center text-sm text-teal-600 hover:text-teal-800">
          ← Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">

        {/* Name */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-teal-700 mb-1">Full Name *</label>
          <input
            name="name" required
            placeholder="e.g. Jane Smith"
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Email */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-teal-700 mb-1">Work Email *</label>
          <input
            name="email" type="email" required
            placeholder="you@company.com"
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Password *</label>
          <input
            name="password" type="password" required
            placeholder="Min. 8 characters"
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Confirm Password *</label>
          <input
            name="confirm" type="password" required
            placeholder="Re-enter password"
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Role *</label>
          <select
            name="role" required
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {roles.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Team */}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Team</label>
          <input
            name="team"
            list="team-options"
            placeholder="e.g. Insights"
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <datalist id="team-options">
            {TEAMS.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        {/* Reports To */}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Reports To</label>
          <select
            name="reports_to"
            disabled={selectedRole === 'executive'}
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-emerald-50 disabled:text-slate-400"
          >
            <option value="">— None —</option>
            {selectedRole !== 'executive' && managers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Capacity */}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Capacity (hrs/week)</label>
          <input
            name="capacity_hours" type="number" min={1} max={80}
            defaultValue={40}
            className="w-full border border-emerald-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Creating account...' : 'Create Account'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-teal-600 hover:text-teal-800">Sign in</Link>
      </p>
    </form>
  )
}
