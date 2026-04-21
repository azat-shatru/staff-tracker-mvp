'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'

function ResetPasswordForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState(false)
  const [ready, setReady]         = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Exchange the one-time code from the email link for a session
  useEffect(() => {
    const errorCode = searchParams.get('error_code')
    if (errorCode === 'otp_expired') {
      setInitError('This reset link has expired. Please request a new one.')
      return
    }
    if (searchParams.get('error')) {
      setInitError('This reset link is invalid. Please request a new one.')
      return
    }
    const code = searchParams.get('code')
    if (!code) {
      setInitError('Invalid or expired reset link. Please request a new one.')
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setInitError('This reset link has expired or already been used. Please request a new one.')
      } else {
        setReady(true)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-50">
      <div className="bg-white p-8 rounded-lg shadow-sm border w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-teal-900 mb-1">Staff Tracker</h1>
        <p className="text-sm text-slate-500 mb-6">Set a new password</p>

        {initError ? (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{initError}</p>
            </div>
            <Button type="button" className="w-full" onClick={() => router.push('/login')}>
              Back to sign in
            </Button>
          </div>
        ) : success ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800 mb-1">Password updated!</p>
            <p className="text-sm text-green-700">Redirecting you to sign in...</p>
          </div>
        ) : !ready ? (
          <p className="text-sm text-slate-500 text-center">Verifying reset link...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-teal-700 mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-teal-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}
            <Button type="button" className="w-full" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving...' : 'Update password'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-emerald-50"><p className="text-sm text-slate-500">Loading...</p></div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
