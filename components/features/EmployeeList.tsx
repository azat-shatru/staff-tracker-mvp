'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { createEmployee, updateEmployee, removeEmployee } from '@/app/employees/actions'
import type { User, Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'

const ROLES: Role[] = ['analyst', 'consultant', 'manager', 'director', 'executive']
const TEAMS = ['Insights', 'UST', 'SV Team', 'Programming', 'BA', 'Fielding', 'Management']

type UserRow = Pick<User, 'id' | 'name' | 'email' | 'role' | 'team' | 'reports_to' | 'capacity_hours'>

interface Props {
  users: UserRow[]
  currentUserId: string
  canManage: boolean   // manager / director / executive
}

const EMPTY_FORM = {
  name: '', email: '', role: 'analyst' as Role,
  team: '', reports_to: '', capacity_hours: 40,
}

export default function EmployeeList({ users, currentUserId, canManage }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd]       = useState(false)
  const [editUser, setEditUser]     = useState<UserRow | null>(null)
  const [removeTarget, setRemove]   = useState<UserRow | null>(null)
  const [changePassUser, setChangePw] = useState<UserRow | null>(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [tempPassword, setTempPass] = useState<string | null>(null)
  const [search, setSearch]         = useState('')

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.team ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (ROLE_DISPLAY[u.role] ?? u.role).toLowerCase().includes(search.toLowerCase())
  )

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

  async function handleRemove() {
    if (!removeTarget) return
    setSaving(true)
    const res = await removeEmployee(removeTarget.id)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setRemove(null); router.refresh()
  }

  const managersAndAbove = users.filter(u =>
    u.role === 'manager' || u.role === 'director' || u.role === 'executive'
  )


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

      {/* Table */}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No employees found.
                </td>
              </tr>
            ) : filtered.map(u => {
              const reportsTo  = users.find(r => r.id === u.reports_to)
              const isMe       = u.id === currentUserId

              return (
                <tr key={u.id} className={`hover:bg-emerald-50 ${isMe ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-teal-900 flex items-center gap-1.5">
                      {u.name}
                      {isMe && <span className="text-xs text-blue-500 font-normal">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-teal-700 text-sm">{ROLE_DISPLAY[u.role] ?? u.role}</td>
                  <td className="px-4 py-3 text-teal-700 text-sm">{u.team || '—'}</td>
                  <td className="px-4 py-3 text-teal-700 text-sm">{reportsTo?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-teal-700 text-sm">{u.capacity_hours}h/wk</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {/* Change password — own row only */}
                      {isMe && (
                        <button
                          onClick={() => setChangePw(u)}
                          className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 transition-colors"
                        >
                          Change Password
                        </button>
                      )}
                      {/* Edit — managers only */}
                      {canManage && (
                        <button
                          onClick={() => openEdit(u)}
                          className="text-xs text-slate-500 hover:text-teal-900 border border-emerald-200 rounded px-2 py-1 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {/* Remove — managers only, can't remove yourself */}
                      {canManage && !isMe && (
                        <button
                          onClick={() => setRemove(u)}
                          className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-1 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
        <ChangePasswordModal
          onClose={() => setChangePw(null)}
        />
      )}

      {/* ── Remove Confirm ────────────────────────────────────── */}
      {removeTarget && (
        <Modal title="Remove Employee" onClose={() => setRemove(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">
                This will permanently delete <strong>{removeTarget.name}</strong> and all their data
                (assignments, logged hours). This cannot be undone.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemove(null)} className="px-4 py-2 border border-emerald-200 text-sm rounded-lg hover:bg-emerald-50">
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Removing...' : 'Yes, Remove'}
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
  const [newPassword, setNew]     = useState('')
  const [confirm, setConfirm]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

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
              type="password"
              value={newPassword}
              onChange={e => setNew(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-teal-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
              onClick={handleSave}
              disabled={saving}
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
            value={form.reports_to} onChange={e => set('reports_to', e.target.value)}
            className="w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="">— None —</option>
            {managers.map(m => (
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
