'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { logHours } from '@/app/log-hours/actions'

const RATINGS = [0, 1, 2, 3, 4, 5, 6, 7]

const PAID_LEAVE_KEY = '__paid_leave__'
const SICK_LEAVE_KEY = '__sick_leave__'
const LEAVE_KEYS     = [PAID_LEAVE_KEY, SICK_LEAVE_KEY]

interface Project { id: string; name: string; status: string; created_at: string }
interface Props    { projects: Project[]; recentProjectIds: string[] }

// ── Searchable project dropdown ──────────────────────────────────────────────
type DropdownOption = { key: string; label: string; group: 'leave' | 'recent' | 'new' | 'other' }

function ProjectDropdown({
  options,
  value,
  onChange,
}: {
  options: DropdownOption[]
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const containerRef        = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const q = search.toLowerCase()
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q))
    : options

  const GROUP_LABELS: Record<string, string> = {
    leave:  'Leave',
    recent: 'Recently logged',
    new:    'Recently added',
    other:  'All projects',
  }

  // Group filtered options
  const groups = (['leave', 'recent', 'new', 'other'] as const)
    .map(g => ({ group: g, items: filtered.filter(o => o.group === g) }))
    .filter(g => g.items.length > 0)

  const selectedLabel = options.find(o => o.key === value)?.label ?? ''

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white dark:bg-slate-800 dark:border-slate-600"
      >
        <span className={selectedLabel ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}>
          {selectedLabel || '— Select project —'}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg mt-1 max-h-72 flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No projects match &ldquo;{search}&rdquo;</p>
            ) : (
              groups.map(({ group, items }) => (
                <div key={group}>
                  {/* Only show group headers when not searching */}
                  {!q && (
                    <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                      {GROUP_LABELS[group]}
                    </div>
                  )}
                  {items.map(o => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => { onChange(o.key); setOpen(false); setSearch('') }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-teal-800/40 transition-colors ${
                        value === o.key ? 'bg-emerald-100 dark:bg-teal-700/50 text-teal-800 dark:text-teal-200 font-medium' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function prevWeekMonday(): string {
  const d   = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff - 7)
  return d.toISOString().split('T')[0]
}

export default function LogHoursForm({ projects, recentProjectIds }: Props) {
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

  // Build sorted + grouped dropdown options
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  const recentSet = new Set(recentProjectIds)
  const dropdownOptions: DropdownOption[] = [
    { key: PAID_LEAVE_KEY, label: 'Paid Leave (8h deducted from capacity)', group: 'leave' },
    { key: SICK_LEAVE_KEY, label: 'Sick Leave (8h deducted from capacity)', group: 'leave' },
    // Recently logged — in order of most recent first
    ...recentProjectIds
      .map(id => projects.find(p => p.id === id))
      .filter((p): p is Project => !!p)
      .map(p => ({
        key:   p.id,
        label: p.name + (p.status !== 'active' ? ` (${p.status.replace('_', ' ')})` : ''),
        group: 'recent' as const,
      })),
    // Newly added projects not already in recent
    ...projects
      .filter(p => !recentSet.has(p.id) && p.created_at >= thirtyDaysAgoStr)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(p => ({
        key:   p.id,
        label: p.name + (p.status !== 'active' ? ` (${p.status.replace('_', ' ')})` : ''),
        group: 'new' as const,
      })),
    // Everything else alphabetically
    ...projects
      .filter(p => !recentSet.has(p.id) && p.created_at < thirtyDaysAgoStr)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({
        key:   p.id,
        label: p.name + (p.status !== 'active' ? ` (${p.status.replace('_', ' ')})` : ''),
        group: 'other' as const,
      })),
  ]

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
        <ProjectDropdown
          options={dropdownOptions}
          value={form.project_key}
          onChange={key => set('project_key', key)}
        />
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
