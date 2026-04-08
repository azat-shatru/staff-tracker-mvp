'use client'

import { useState } from 'react'
import { deleteHoursEntry, updateHoursEntry } from '@/app/log-hours/actions'

const RATINGS      = [0, 1, 2, 3, 4, 5, 6, 7]

const PAID_LEAVE_KEY = '__paid_leave__'
const SICK_LEAVE_KEY = '__sick_leave__'
const LEAVE_KEYS     = [PAID_LEAVE_KEY, SICK_LEAVE_KEY]

export interface RecentEntry {
  id:           string
  week_start:   string
  project_id:   string | null
  hours_logged: number
  rating:       number
  leave_type:   string | null
  project_name: string | null
  entry_date:   string
}

interface Props {
  entries:  RecentEntry[]
  projects: { id: string; name: string; status: string }[]
}

function entryLabel(e: RecentEntry) {
  if (e.leave_type === 'paid_leave') return 'Paid Leave'
  if (e.leave_type === 'sick_leave') return 'Sick Leave'
  return e.project_name ?? '—'
}

function hoursAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 1) return `${h}h ago`
  return `${m}m ago`
}

export default function RecentEntries({ entries: initial, projects }: Props) {
  const [entries,   setEntries]   = useState<RecentEntry[]>(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm,  setEditForm]  = useState<{
    week_start: string; project_key: string; hours: string; rating: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  function startEdit(e: RecentEntry) {
    const project_key =
      e.leave_type === 'paid_leave' ? PAID_LEAVE_KEY :
      e.leave_type === 'sick_leave' ? SICK_LEAVE_KEY :
      e.project_id ?? ''
    setEditingId(e.id)
    setEditForm({ week_start: e.week_start, project_key, hours: String(e.hours_logged), rating: String(e.rating) })
    setError(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return
    setSaving(true)
    const res = await deleteHoursEntry(id)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function handleSave() {
    if (!editForm || !editingId) return
    const isLeave  = LEAVE_KEYS.includes(editForm.project_key)
    const hours    = isLeave ? 8 : parseFloat(editForm.hours)
    if (!isLeave && isNaN(hours)) { setError('Invalid hours'); return }
    const leaveType =
      editForm.project_key === PAID_LEAVE_KEY ? 'paid_leave' :
      editForm.project_key === SICK_LEAVE_KEY ? 'sick_leave' : undefined

    setSaving(true); setError(null)
    const res = await updateHoursEntry(editingId, {
      week_start:  editForm.week_start,
      project_id:  leaveType ? null : editForm.project_key,
      hours,
      rating:      parseInt(editForm.rating),
      leave_type:  leaveType,
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }

    const projName = projects.find(p => p.id === editForm.project_key)?.name ?? null
    setEntries(prev => prev.map(e => e.id === editingId ? {
      ...e,
      week_start:   editForm.week_start,
      project_id:   leaveType ? null : editForm.project_key,
      hours_logged: hours,
      rating:       parseInt(editForm.rating),
      leave_type:   leaveType ?? null,
      project_name: leaveType ? null : projName,
    } : e))
    setEditingId(null); setEditForm(null)
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <h3 className="text-sm font-semibold text-teal-900 mb-1">Your Recent Entries</h3>
      <p className="text-xs text-slate-400 mb-3">Entries you submitted in the past 48 hours — you can edit or delete them.</p>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded mb-3">{error}</p>}

      {entries.length === 0 && (
        <p className="text-xs text-slate-400 italic">No entries in the past 48 hours.</p>
      )}

      <div className="divide-y">
        {entries.map(entry => {

          /* ── Edit row ── */
          if (editingId === entry.id && editForm) {
            const isLeave = LEAVE_KEYS.includes(editForm.project_key)
            function setF(key: string, val: string) {
              setEditForm(f => {
                if (!f) return f
                const next = { ...f, [key]: val }
                if (key === 'project_key') {
                  next.hours = LEAVE_KEYS.includes(val) ? '8'
                    : (LEAVE_KEYS.includes(f.project_key) ? '' : f.hours)
                }
                return next
              })
            }
            return (
              <div key={entry.id} className="py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Week of</label>
                    <input type="date" value={editForm.week_start}
                      onChange={e => setF('week_start', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Project / Leave</label>
                    <select value={editForm.project_key} onChange={e => setF('project_key', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <optgroup label="Leave">
                        <option value={PAID_LEAVE_KEY}>Paid Leave</option>
                        <option value={SICK_LEAVE_KEY}>Sick Leave</option>
                      </optgroup>
                      <optgroup label="Projects">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Hours</label>
                    <input type="number" min="0" step="0.5" disabled={isLeave}
                      value={editForm.hours} onChange={e => setF('hours', e.target.value)}
                      placeholder={isLeave ? '8 (fixed)' : 'e.g. 8'}
                      className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-emerald-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Rating (0–7)</label>
                    <select value={editForm.rating} onChange={e => setF('rating', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingId(null); setEditForm(null) }}
                    className="px-3 py-1 border text-xs rounded hover:bg-emerald-50">
                    Cancel
                  </button>
                </div>
              </div>
            )
          }

          /* ── Display row ── */
          return (
            <div key={entry.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs min-w-0 flex-wrap">
                <span className="text-slate-400 shrink-0">{entry.week_start}</span>
                <span className={`font-medium shrink-0 ${entry.leave_type ? 'text-yellow-700' : 'text-teal-900'}`}>
                  {entryLabel(entry)}
                </span>
                <span className="text-teal-700 shrink-0">{entry.hours_logged}h</span>
                <span className="text-slate-400 shrink-0">★ {entry.rating}</span>
                <span className="text-slate-300 shrink-0">{hoursAgo(entry.entry_date)}</span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => startEdit(entry)}
                  className="px-2 py-1 text-xs border rounded hover:bg-emerald-50">
                  Edit
                </button>
                <button onClick={() => handleDelete(entry.id)} disabled={saving}
                  className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
