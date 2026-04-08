'use client'

import { useState } from 'react'
import Link from 'next/link'
import { login, resetPassword } from './actions'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent]   = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      const result = await login(formData)
      if (result?.error) setError(result.error)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!resetEmail) { setResetError('Please enter your email address.'); return }
    setResetLoading(true)
    setResetError(null)
    const result = await resetPassword(resetEmail)
    setResetLoading(false)
    if (result.error) { setResetError(result.error); return }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-sm border dark:border-slate-700 w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-teal-900 dark:text-teal-300 mb-1">Staff Tracker</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {showReset ? 'Reset your password' : 'Sign in to your account'}
        </p>

        {/* ── Forgot password panel ─────────────────────────────── */}
        {showReset ? (
          <div className="space-y-4">
            {resetSent ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800 mb-1">Check your email</p>
                <p className="text-sm text-green-700">
                  A password reset link has been sent to <strong>{resetEmail}</strong>.
                  Click the link in the email to set a new password.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {resetError && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{resetError}</p>
                )}
                <Button
                  type="button"
                  className="w-full"
                  disabled={resetLoading}
                  onClick={handleReset}
                >
                  {resetLoading ? 'Sending...' : 'Send reset link'}
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setShowReset(false); setResetSent(false); setResetError(null); setResetEmail('') }}
              className="w-full text-sm text-teal-600 hover:text-teal-800 text-center"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          /* ── Sign in form ───────────────────────────────────── */
          <form action={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-teal-700 dark:text-teal-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setShowReset(true); setError(null) }}
                  className="text-xs text-teal-600 hover:text-teal-800"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            <p className="text-center text-sm text-slate-500">
              New to Staff Tracker?{' '}
              <Link href="/signup" className="text-teal-600 hover:text-teal-800">Create an account</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
