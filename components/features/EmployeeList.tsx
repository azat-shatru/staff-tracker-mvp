'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { createEmployee, updateEmployee, deactivateEmployee, reactivateEmployee } from '@/app/employees/actions'
import type { User, Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'

const ROLES: Role[] = ['analyst', 'consultant', 'manager', 'director', 'executive']
const TEAMS = ['Insights', 'UST', 'SV Team', 'Programming', 'BA', 'Fielding', 'Management']

type UserRow = Pick<User, 'id' | 'name' | 'email' | 'role' | 'team' | 'reports_to' | 'capacity_hours' | 'active'>

interface Props {
  users: UserRow[]
  currentUserId: string
  canManage: boolean
}

const EMPTY_FORM = {
  name: '', email: '', role: 'analyst' as Role,
  team: '', reports_to: '', capacity_hours: 40,
}

export default function EmployeeList({ users, currentUserId, canManage }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd]             = useState(false)
  const [editUser, setEditUser]           = useState<UserRow | null>(null)
  const [deactivateTarget, setDeactivate] = useState<UserRow | null>(null)
  const [reactivateTarget, setReactivate] = useState<UserRow | null>(null)
  const [changePassUser, setChangePw]     = useState<UserRow | null>(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [tempPassword, setTempPass]       = useState<string | null>(null)
  const [search, setSearch]               = useState('')
  const [showInactive, setShowInactive]   = useState(false)

  const activeUsers   = users.filter(u => u.active !== false)
  const inactiveUsers = users.filter(u => u.active === false)

  const filterFn = (u: UserRow) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.team ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (ROLE_DISPLAY[u.role] ?? u.role).toLowerCase().includes(search.toLowerCase())

  const filteredActive   = activeUsers.filter(filterFn)
  const filteredInactive = inactiveUsers.filter(filterFn)

  function openAdd() {
    setForm(EMPTY_FORM); setError(null); setTempPass(null); setShowAdd(true)
  }

  function openEdit(u: UserRow) {
    setForm({
      name: u.name, email: u.email, role: u.role,
      team: u.team ?? '',
      reports_to: u.reports_to ?? '', capacity_hours: u.capacity_hours,
    })
    setError(null); setEditUser(u)
  }

  async function handleAdd() {
    if (!form.name || !form.email) { setError('Name and email are required.'); return }
    setSaving(true); setError(null)
    const res = await createEmployee({
      name: form.name, email: form.email, role: form.role,
      team: form.team,
      reports_to: form.reports_to || null, capacity_hours: form.capacity_hours,
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setTempPass(res.tempPassword ?? null)
  }

  async function handleEdit() {
    if (!editUser || !form.name) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    const res = await updateEmployee(editUser.id, {
      name: form.name, role: form.role,
      team: form.team,
      reports_to: form.reports_to || null, capacity_hours: form.capacity_hours,
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setEditUser(null); router.refresh()
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    setSaving(true); setError(null)
    const res = await deactivateEmployee(deactivateTarget.id)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setDeactivate(null); router.refresh()
  }

  async function handleReactivate() {
    if (!reactivateTarget) return
    setSaving(true); setError(null)
    const res = await reactivateEmployee(reactivateTarget.id)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setReactivate(null); router.refresh()
  }

  const managersAndAbove = activeUsers.filter(u =>
    u.role === 'manager' || u.role === 'director' || u.role === 'executive'
  )

  function EmployeeRow({ u, inactive = false }: { u: UserRow; inactive?: boolean }) {
    const reportsTo = users.find(r => r.id === u.reports_to)
    const isMe      = u.id === currentUserId

    return (
      <tr key={u.id} className={`hover:bg-emerald-50 ${isMe ? 'bg-blue-50/30' : ''} ${inactive ? 'opacity-50' : ''}`}>
        <td className="px-4 py-3">
          <div className="font-medium text-teal-900 flex items-center gap-1.5">
            {u.name}
            {isMe && <span className="text-xs text-blue-500 font-normal">(you)</span>}
            {inactive && (
              <span className="text-xs font-medium px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                Inactive
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400">{u.email}</div>
        </td>
        <td className="px-4 py-3 text-teal-700 text-sm">{ROLE_DISPLAY[u.role] ?? u.role}</td>
        <td className="px-4 py-3 text-teal-700 text-sm">{u.team || '—'}</td>
        <td className="px-4 py-3 text-teal-700 text-sm">{reportsTo?.name ?? '—'}</td>
        <td className="px-4 py-3 text-teal-700 text-sm">{u.capacity_hours}h/wk</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            {isMe && !inactive && (
              <button
                onClick={() => setChangePw(u)}
                className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 transition-colors"
              >
                Change Password
              </button>
            )}
            {canManage && !inactive && (
              <button
                onClick={() => openEdit(u)}
                className="text-xs text-slate-500 hover:text-teal-900 border border-emerald-200 rounded px-2 py-1 transition-colors"
              >
                Edit
              </button>
            )}
            {canManage && !isMe && !inactive && (
              <button
                onClick={() => { setError(null); setDeactivate(u) }}
                className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 rounded px-2 py-1 transition-colors"
              >
                Deactivate
              </button>
            )}
            {canManage && inactive && (
              <button
                onClick={() => { setError(null); setReactivate(u) }}
                className="text-xs text-teal-600 hover:text-teal-800 border border-teal-200 rounded px-2 py-1 transition-colors"
              >
                Reactivate
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email, team..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        {canManage && (
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors shrink-0"
          >
            + Add Employee
          </button>
        )}
      </div>

      {/* Active employees table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-emerald-50 border-b">
            <tr>
              {['Name', 'Role', 'Team', 'Reports To', 'Capacity', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredActive.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No employees found.
                </td>
              </tr>
            ) : filteredActive.map(u => <EmployeeRow key={u.id} u={u} />)}
          </tbody>
        </table>
      </div>

      {/* Inactive employees — managers only */}
      {canManage && inactiveUsers.length > 0 && (
        <div>
          <button
            onClick={() => setShowInactive(v => !v)}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5 mb-2"
          >
            <span>{showInactive ? '▾' : '▸'}</span>
            {inactiveUsers.length} deactivated employee{inactiveUsers.length !== 1 ? 's' : ''}
          </button>
          {showInactive && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Name', 'Role', 'Team', 'Reports To', 'Capacity', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInactive.map(u => <EmployeeRow key={u.id} u={u} inactive />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Modal ─────────────────────────────────────────── */}
      {showAdd && (
        <Modal title="Add Employee" onClose={() => { setShowAdd(false); if (tempPassword) router.refresh() }}>
          {tempPassword ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800 mb-2">Employee created successfully!</p>
                <p className="text-sm text-green-700">Share this temporary password:</p>
                <p className="mt-2 font-mono text-lg font-bold text-green-900 bg-white border border-green-200 rounded px-3 py-2 text-center select-all">
                  {tempPassword}
                </p>
                <p className="text-xs text-green-600 mt-2">The employee can change it from the Employees page after logging in.</p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => { setShowAdd(false); router.refresh() }}
                  className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <EmployeeForm
              form={form} setForm={setForm} managers={managersAndAbove}
              error={error} saving={saving} showEmail
              onSave={handleAdd} onCancel={() => setShowAdd(false)}
            />
          )}
        </Modal>
      )}

      {/* ── Edit Modal ────────────────────────────────────────── */}
      {editUser && (
        <Modal title={`Edit — ${editUser.name}`} onClose={() => setEditUser(null)}>
          <EmployeeForm
            form={form} setForm={setForm}
            managers={managersAndAbove.filter(m => m.id !== editUser.id)}
            error={error} saving={saving}
            onSave={handleEdit} onCancel={() => setEditUser(null)}
          />
        </Modal>
      )}

      {/* ── Change Password Modal ─────────────────────────────── */}
      {changePassUser && (
        <ChangePasswordModal onClose={() => setChangePw(null)} />
      )}

      {/* ── Deactivate Confirm ────────────────────────────────── */}
      {deactivateTarget && (
        <Modal title="Deactivate Employee" onClose={() => setDeactivate(null)}>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 font-medium mb-1">
                Deactivate <strong>{deactivateTarget.name}</strong>?
              </p>
              <p className="text-sm text-amber-700">
                They will be blocked from logging in and removed from active views.
                All their historical data is preserved and you can reactivate them at any time.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeactivate(null)}
                className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={saving}
                className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Deactivating...' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Reactivate Confirm ────────────────────────────────── */}
      {reactivateTarget && (
        <Modal title="Reactivate Employee" onClose={() => setReactivate(null)}>
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <p className="text-sm text-teal-800 font-medium mb-1">
                Reactivate <strong>{reactivateTarget.name}</strong>?
              </p>
              <p className="text-sm text-teal-700">
                They will be able to log in again and will appear in all active employee views.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReactivate(null)}
                className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReactivate}
                disabled={saving}
                className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Reactivating...' : 'Yes, Reactivate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true); setError(null)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      {success ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">Password updated successfully.</p>
          </div>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-teal-700 mb-1">New Password</label>
            <input
              type="password" value={newPassword} onChange={e => setNew(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-teal-700 mb-1">Confirm Password</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50">
              Cancel
            </button>
            <button
              onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Employee form ────────────────────────────────────────────────────────────
function EmployeeForm({
  form, setForm, managers, error, saving, showEmail, onSave, onCancel,
}: {
  form: typeof EMPTY_FORM
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>
  managers: UserRow[]
  error: string | null
  saving: boolean
  showEmail?: boolean
  onSave: () => void
  onCancel: () => void
}) {
  function set(key: keyof typeof EMPTY_FORM, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Name *</label>
          <input
            value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="Full name"
            className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        {showEmail && (
          <div>
            <label className="block text-xs font-medium text-teal-700 mb-1">Email *</label>
            <input
              type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="work@company.com"
              className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Role *</label>
          <select
            value={form.role} onChange={e => set('role', e.target.value)}
            className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {ROLES.map(r => <option key={r} value={r}>{ROLE_DISPLAY[r] ?? r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Team</label>
          <input
            list="team-options" value={form.team} onChange={e => set('team', e.target.value)}
            placeholder="e.g. Insights"
            className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <datalist id="team-options">
            {TEAMS.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Reports To</label>
          <select
            value={form.role === 'executive' ? '' : form.reports_to}
            onChange={e => set('reports_to', e.target.value)}
            disabled={form.role === 'executive'}
            className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-emerald-50 disabled:text-slate-400"
          >
            <option value="">— None —</option>
            {form.role !== 'executive' && managers.map(m => (
              <option key={m.id} value={m.id}>{m.name} · {ROLE_DISPLAY[m.role] ?? m.role}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-teal-700 mb-1">Capacity (hrs/week)</label>
          <input
            type="number" min={1} max={80}
            value={form.capacity_hours} onChange={e => set('capacity_hours', Number(e.target.value))}
            className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50">
          Cancel
        </button>
        <button
          onClick={onSave} disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-teal-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-teal-700 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
