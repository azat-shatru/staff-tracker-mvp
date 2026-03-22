'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { addAssignment, removeAssignment, updateAssignmentAllocation } from '@/app/projects/[id]/assignment-actions'
import type { Assignment, User } from '@/lib/types'

interface Props {
  projectId: string
  projectManager: Pick<User, 'id' | 'name' | 'role' | 'designation'> | null
  assignments: (Assignment & { user: Pick<User, 'id' | 'name' | 'role' | 'designation'> })[]
  users: Pick<User, 'id' | 'name' | 'role' | 'designation'>[]
  canManage: boolean
}

const ROLE_LABELS = ['Analyst', 'Consultant', 'QC Reviewer', 'Support', 'Data Team']

/** Round x to the nearest step, clamped to [min, max] */
function snapToStep(x: number, step: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(x / step) * step))
}

export default function AssignmentsSection({ projectId, projectManager, assignments, users, canManage }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ userId: '', roleLabel: '', allocationPct: 50 })
  const [localAssignments, setLocalAssignments] = useState(assignments)
  const router = useRouter()

  // Sync with fresh server data while preserving any optimistic entries not yet confirmed by the DB
  useEffect(() => {
    setLocalAssignments(prev => {
      const pending = prev.filter(
        a => a.id.startsWith('optimistic-') && !assignments.some(sa => sa.user_id === a.user_id)
      )
      return [...assignments, ...pending]
    })
  }, [assignments])

  // Total allocation across all assigned members
  const totalAllocPct = localAssignments.reduce((sum, a) => sum + a.allocation_pct, 0)
  const remaining = Math.max(0, 100 - totalAllocPct)

  // When the form is opened, default allocation to the remaining headroom (snapped to 10)
  function openForm() {
    const defaultPct = remaining > 0 ? snapToStep(remaining, 10, 10, 100) : 10
    setForm({ userId: '', roleLabel: '', allocationPct: defaultPct })
    setShowForm(true)
  }

  // Exclude already-assigned users and the manager from the add dropdown
  const assignedUserIds = new Set([
    ...localAssignments.map(a => a.user_id),
    ...(projectManager ? [projectManager.id] : []),
  ])
  const availableUsers = users.filter(u => !assignedUserIds.has(u.id))

  async function handleAdd() {
    if (!form.userId) return
    setSaving(true)

    // Optimistically add the new member immediately
    const selectedUser = users.find(u => u.id === form.userId)
    if (!selectedUser) { setSaving(false); return }
    const optimisticAssignment = {
      id: `optimistic-${crypto.randomUUID()}`,
      project_id: projectId,
      user_id: form.userId,
      role_label: form.roleLabel,
      allocation_pct: form.allocationPct,
      start_date: null,
      end_date: null,
      user: selectedUser,
    } as Assignment & { user: Pick<User, 'id' | 'name' | 'role' | 'designation'> }
    setLocalAssignments(prev => [...prev, optimisticAssignment])

    const result = await addAssignment(projectId, form.userId, form.roleLabel, form.allocationPct, null, null)
    if (result?.error) {
      setLocalAssignments(prev => prev.filter(a => a.id !== optimisticAssignment.id))
      setSaving(false)
      return
    }

    setForm({ userId: '', roleLabel: '', allocationPct: 50 })
    setShowForm(false)
    setSaving(false)
    router.refresh()
  }

  async function handleRemove(assignmentId: string) {
    setLocalAssignments(prev => prev.filter(a => a.id !== assignmentId))
    const result = await removeAssignment(assignmentId, projectId)
    if (result && 'error' in result) {
      router.refresh()
      return
    }
    router.refresh()
  }

  async function handleAllocationChange(assignmentId: string, value: number) {
    setLocalAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, allocation_pct: value } : a))
    await updateAssignmentAllocation(assignmentId, projectId, value)
    router.refresh()
  }

  const totalColor =
    totalAllocPct === 100 ? 'text-green-600' :
    totalAllocPct > 100   ? 'text-red-600' :
    'text-orange-500'

  const totalBg =
    totalAllocPct === 100 ? 'bg-green-50 border-green-200' :
    totalAllocPct > 100   ? 'bg-red-50 border-red-200' :
    'bg-orange-50 border-orange-200'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Team Assignments</p>
        {canManage && !showForm && availableUsers.length > 0 && (
          <button
            onClick={openForm}
            className="text-xs text-slate-500 hover:text-teal-900 border border-emerald-200 rounded px-2 py-1 transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      <div className="divide-y border rounded-lg overflow-hidden">
        {/* Permanent manager row */}
        {projectManager ? (
          <div className="flex items-center justify-between px-4 py-3 bg-emerald-50">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-teal-900">{projectManager.name}</span>
              <span className="text-xs text-slate-400">Project Manager</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-teal-700">
              Permanent
            </span>
          </div>
        ) : (
          <div className="px-4 py-3 bg-emerald-50">
            <span className="text-xs text-slate-400 italic">No manager assigned</span>
          </div>
        )}

        {/* Assigned members */}
        {localAssignments.map(a => (
          <AssignmentRow
            key={a.id}
            assignment={a}
            canManage={canManage}
            onRemove={() => handleRemove(a.id)}
            onAllocationChange={(val) => handleAllocationChange(a.id, val)}
          />
        ))}

        {/* Empty state */}
        {localAssignments.length === 0 && !showForm && (
          <div className="px-4 py-3">
            <p className="text-xs text-slate-300 italic">No other members assigned</p>
          </div>
        )}

        {/* Allocation total footer */}
        {localAssignments.length > 0 && (
          <div className={`flex items-center justify-between px-4 py-2 border-t ${totalBg}`}>
            <span className="text-xs text-slate-500">Total allocation</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${totalColor}`}>{totalAllocPct}%</span>
              {totalAllocPct !== 100 && (
                <span className="text-xs text-slate-400">
                  {totalAllocPct < 100
                    ? `(${100 - totalAllocPct}% unassigned)`
                    : `(${totalAllocPct - 100}% over)`}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border rounded-lg p-4 bg-emerald-50 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-teal-700">Add team member</p>
            {remaining > 0 && (
              <span className="text-xs text-orange-500">{remaining}% remaining to assign</span>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Member</label>
              <select
                value={form.userId}
                onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">— Select —</option>
                {availableUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.designation || u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Role on Project</label>
              <input
                list="role-labels"
                value={form.roleLabel}
                onChange={e => setForm(f => ({ ...f, roleLabel: e.target.value }))}
                placeholder="e.g. Analyst"
                className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <datalist id="role-labels">
                {ROLE_LABELS.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Allocation %</label>
                {totalAllocPct + form.allocationPct > 100 && (
                  <span className="text-xs text-red-500">
                    Total will be {totalAllocPct + form.allocationPct}% — over by {totalAllocPct + form.allocationPct - 100}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={form.allocationPct}
                  onChange={e => setForm(f => ({ ...f, allocationPct: Number(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-teal-700 w-10 text-right">{form.allocationPct}%</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                After adding: {totalAllocPct + form.allocationPct}% of 100% assigned
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!form.userId || saving}
              className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1.5 border border-emerald-200 text-teal-700 rounded hover:bg-emerald-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignmentRow({
  assignment,
  canManage,
  onRemove,
  onAllocationChange,
}: {
  assignment: Assignment & { user: Pick<User, 'id' | 'name' | 'role' | 'designation'> }
  canManage: boolean
  onRemove: () => void
  onAllocationChange: (val: number) => void
}) {
  const [localPct, setLocalPct] = useState(assignment.allocation_pct)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setLocalPct(assignment.allocation_pct)
  }, [assignment.allocation_pct, editing])

  function handleBlur() {
    setEditing(false)
    if (localPct !== assignment.allocation_pct) {
      onAllocationChange(localPct)
    }
  }

  const allocationColor =
    localPct >= 80 ? 'bg-red-100 text-red-700' :
    localPct >= 50 ? 'bg-yellow-100 text-yellow-700' :
    'bg-green-100 text-green-700'

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-teal-900">{assignment.user.name}</span>
        <span className="text-xs text-slate-400">
          {assignment.role_label || (assignment.user.designation || assignment.user.role)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {canManage && editing ? (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={10}
              max={100}
              step={10}
              value={localPct}
              onChange={e => setLocalPct(Number(e.target.value))}
              onBlur={handleBlur}
              className="w-24"
              autoFocus
            />
            <span className="text-xs font-medium text-teal-700 w-8">{localPct}%</span>
          </div>
        ) : (
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${canManage ? 'cursor-pointer hover:opacity-80' : ''} ${allocationColor}`}
            onClick={() => canManage && setEditing(true)}
            title={canManage ? 'Click to edit' : undefined}
          >
            {localPct}%
          </span>
        )}
        {canManage && (
          <button
            onClick={onRemove}
            className="text-xs text-slate-300 hover:text-red-500 transition-colors"
            title="Remove"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
