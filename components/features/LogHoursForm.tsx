'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logHours } from '@/app/log-hours/actions'

const RATINGS = [0, 1, 2, 3, 4, 5, 6, 7]

const PAID_LEAVE_KEY = '__paid_leave__'
const SICK_LEAVE_KEY = '__sick_leave__'
const LEAVE_KEYS     = [PAID_LEAVE_KEY, SICK_LEAVE_KEY]

interface Project { id: string; name: string; status: string }
interface Props    { projects: Project[] }

function prevWeekMonday(): string {
  const d   = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff - 7)
  return d.toISOString().split('T')[0]
}

export default function LogHoursForm({ projects }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    week_start:  prevWeekMonday(),
    project_key: '',
    hours:       '',
    rating:      '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isLeave = LEAVE_KEYS.includes(form.project_key)

  function set(key: keyof typeof form, value: string) {
    setForm(f => {
      const next = { ...f, [key]: value }
      if (key === 'project_key') {
        next.hours = LEAVE_KEYS.includes(value) ? '8' : (LEAVE_KEYS.includes(f.project_key) ? '' : f.hours)
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.project_key)           { setError('Please select a project or leave type.'); return }
    if (form.rating === '')          { setError('Please select a rating.'); return }
    if (!isLeave && !form.hours)     { setError('Please enter hours.'); return }

    const hours = parseFloat(form.hours)
    if (!isLeave && (isNaN(hours) || hours < 0)) { setError('Hours must be a positive number.'); return }

    const leaveType =
      form.project_key === PAID_LEAVE_KEY ? 'paid_leave' :
      form.project_key === SICK_LEAVE_KEY ? 'sick_leave' : undefined

    setSaving(true); setError(null)
    const res = await logHours({
      week_start: form.week_start,
      project_id: leaveType ? null : form.project_key,
      hours:      isLeave ? 8 : hours,
      rating:     parseInt(form.rating),
      leave_type: leaveType,
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800">
            {isLeave ? 'Leave logged successfully!' : 'Hours logged successfully!'}
          </p>
          {isLeave && (
            <p className="text-xs text-green-700 mt-1">
              8h deducted from your capacity for this week.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setSuccess(false); setForm(f => ({ ...f, project_key: '', hours: '', rating: '' })) }}
            className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50"
          >
            Log more
          </button>
          <button
            onClick={() => router.push('/employees')}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Week of */}
      <div>
        <label className="block text-xs font-medium text-teal-700 mb-1">Week of</label>
        <input
          type="date"
          value={form.week_start}
          onChange={e => set('week_start', e.target.value)}
          className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <p className="text-xs text-slate-400 mt-0.5">Select the Monday of the week you are logging.</p>
      </div>

      {/* Project / Leave */}
      <div>
        <label className="block text-xs font-medium text-teal-700 mb-1">Project</label>
        <select
          value={form.project_key}
          onChange={e => set('project_key', e.target.value)}
          className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">— Select project —</option>
          <optgroup label="Leave">
            <option value={PAID_LEAVE_KEY}>Paid Leave (8h deducted from capacity)</option>
            <option value={SICK_LEAVE_KEY}>Sick Leave (8h deducted from capacity)</option>
          </optgroup>
          <optgroup label="Projects">
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.status !== 'active' ? ` (${p.status.replace('_', ' ')})` : ''}
              </option>
            ))}
          </optgroup>
        </select>
        {isLeave && (
          <p className="text-xs text-yellow-600 mt-0.5 bg-yellow-50 px-2 py-1 rounded">
            Each leave entry counts as 1 day (8h) and reduces your utilisation denominator.
          </p>
        )}
      </div>

      {/* Hours — locked to 8 for leave */}
      <div>
        <label className="block text-xs font-medium text-teal-700 mb-1">Hours</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={form.hours}
          disabled={isLeave}
          onChange={e => set('hours', e.target.value)}
          placeholder={isLeave ? '8 (fixed)' : 'e.g. 8 or 7.5'}
          className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-emerald-50 disabled:text-slate-400"
        />
      </div>

      {/* Rating */}
      <div>
        <label className="block text-xs font-medium text-teal-700 mb-1">Rating (0–7)</label>
        <select
          value={form.rating}
          onChange={e => set('rating', e.target.value)}
          className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">— Select rating —</option>
          {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => router.push('/employees')}
          className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isLeave ? 'Log Leave' : 'Log Hours'}
        </button>
      </div>
    </form>
  )
}
