'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDeliverable, approveQC, markDeliverable } from '@/app/projects/[id]/deliverable-actions'
import type { Deliverable, DeliverableStatus } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  final: 'Final',
  ad_hoc: 'Ad-hoc',
}

const STATUS_CONFIG: Record<DeliverableStatus, { label: string; color: string }> = {
  pending:      { label: 'Pending',      color: 'bg-emerald-100 text-slate-500' },
  qc_required:  { label: 'QC Done',      color: 'bg-yellow-100 text-yellow-700' },
  sent:         { label: 'Sent',         color: 'bg-blue-100 text-blue-700' },
  complete:     { label: 'Complete',     color: 'bg-green-100 text-green-700' },
}

function formatDateTime(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  stageId: string
  projectId: string
  deliverables: Deliverable[]
}

export default function DeliverablesSection({ stageId, projectId, deliverables }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const router = useRouter()

  async function handleAdd(formData: FormData) {
    setLoading(true)
    setActionError(null)
    const result = await addDeliverable(formData, stageId, projectId)
    if (result.error) setActionError(result.error)
    else setShowForm(false)
    setLoading(false)
    router.refresh()
  }

  async function handleQC(deliverableId: string) {
    setActionError(null)
    const result = await approveQC(deliverableId, projectId)
    if ('error' in result) setActionError(result.error)
    router.refresh()
  }

  async function handleMark(deliverableId: string, status: DeliverableStatus) {
    setActionError(null)
    const result = await markDeliverable(deliverableId, status, projectId)
    if ('error' in result) setActionError(result.error)
    else router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Deliverables</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-2.5 py-1 border border-emerald-200 rounded hover:bg-emerald-50 transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Add deliverable form */}
      {showForm && (
        <form action={handleAdd} className="bg-emerald-50 rounded-lg p-4 space-y-3 border">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-teal-700 mb-1">Deliverable Name *</label>
              <input
                name="name"
                required
                placeholder="e.g. Weekly status report"
                className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-teal-700 mb-1">Type *</label>
              <select
                name="type"
                required
                className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="final">Final</option>
                <option value="ad_hoc">Ad-hoc</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-teal-700 mb-1">Expected Date</label>
              <input
                name="expected_date"
                type="date"
                className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-teal-700 mb-1">Expected Time (HH:MM)</label>
              <input
                name="expected_time"
                type="time"
                defaultValue="17:00"
                className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Adding...' : 'Add Deliverable'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1.5 border border-emerald-200 rounded hover:bg-emerald-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Error message */}
      {actionError && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
          {actionError}
        </div>
      )}

      {/* Deliverables list */}
      {deliverables.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400 italic">No deliverables yet.</p>
      ) : (
        <div className="divide-y border rounded-lg overflow-hidden">
          {deliverables.map(d => (
            <div key={d.id} className="bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-teal-900 truncate">{d.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-slate-500 rounded">
                      {TYPE_LABELS[d.type]}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_CONFIG[d.status].color}`}>
                      {STATUS_CONFIG[d.status].label}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-slate-400">
                    <span>Due: {formatDateTime(d.expected_at)}</span>
                    {d.delivered_at && <span>Sent: {formatDateTime(d.delivered_at)}</span>}
                    {d.qc_approved_by && <span className="text-green-600">✓ QC approved</span>}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5 shrink-0">
                  {d.status === 'pending' && (
                    <button
                      onClick={() => handleQC(d.id)}
                      className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100 transition-colors"
                    >
                      Approve QC
                    </button>
                  )}
                  {d.status === 'qc_required' && (
                    <>
                      <button
                        onClick={() => handleMark(d.id, 'sent')}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                      >
                        Mark Sent
                      </button>
                      <button
                        onClick={() => handleMark(d.id, 'complete')}
                        className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors"
                      >
                        Complete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
