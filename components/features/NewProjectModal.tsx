'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createProject } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'
import type { User } from '@/lib/types'

const PROJECT_TYPES = [
  'Brand Tracking',
  'Ad Testing',
  'Concept Testing',
  'Customer Satisfaction',
  'Market Segmentation',
  'Usage & Attitude',
  'Product Testing',
  'Other',
]

interface Props {
  users: Pick<User, 'id' | 'name' | 'role' | 'designation'>[]
}

export default function NewProjectModal({ users }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      const result = await createProject(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        formRef.current?.reset()
        router.push(`/projects/${result.projectId}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Project</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-white mb-4">New Project</h2>

            <form ref={formRef} action={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-teal-700 mb-1">Project Name *</label>
                <input
                  name="name"
                  required
                  className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. Brand Health Q2 2026"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-teal-700 mb-1">Client *</label>
                <input
                  name="client"
                  required
                  className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Client name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-teal-700 mb-1">Project Type *</label>
                <select
                  name="project_type"
                  required
                  className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select type...</option>
                  {PROJECT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-teal-700 mb-1">Project Manager *</label>
                <select
                  name="project_manager_id"
                  required
                  className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select manager...</option>
                  {users
                    .filter(u => u.role === 'manager' || u.role === 'consultant')
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.designation || u.role})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-teal-700 mb-1">Kickoff Date</label>
                  <input
                    name="kickoff_date"
                    type="date"
                    className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-teal-700 mb-1">Target Delivery</label>
                  <input
                    name="target_delivery_date"
                    type="date"
                    className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
