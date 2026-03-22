'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePoc } from '@/app/projects/[id]/poc-actions'
import type { User } from '@/lib/types'

const POC_TEAMS = [
  { key: 'Insights',          label: 'Insights' },
  { key: 'UST',               label: 'UST' },
  { key: 'SV Team',           label: 'SV Team' },
  { key: 'Programming',       label: 'PT' },
  { key: 'BA',                label: 'BA Team' },
  { key: 'Fielding Vendor',   label: 'Fielding' },
]

interface PocEntry {
  team_name: string
  user_id: string | null
}

interface Props {
  projectId: string
  users: User[]
  pocs: PocEntry[]
}

export default function PocRegistry({ projectId, users, pocs }: Props) {
  const pocMap = Object.fromEntries(pocs.map(p => [p.team_name, p.user_id ?? '']))
  const [values, setValues] = useState<Record<string, string>>(pocMap)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const router = useRouter()

  async function handleChange(teamKey: string, userId: string) {
    setValues(v => ({ ...v, [teamKey]: userId }))
    setSaving(teamKey)
    await savePoc(projectId, teamKey, userId || null)
    setSaving(null)
    setSaved(teamKey)
    setTimeout(() => setSaved(null), 2000)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Point of Contact</p>
      <div className="divide-y border rounded-lg overflow-hidden">
        {POC_TEAMS.map(team => {
          const currentUserId = values[team.key] ?? ''
          const isSaving = saving === team.key
          const isSaved = saved === team.key

          return (
            <div key={team.key} className="flex items-center gap-2 px-3 py-2 bg-white">
              <span className="text-xs font-medium text-teal-700 w-16 shrink-0">{team.label}</span>
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <select
                  value={currentUserId}
                  onChange={e => handleChange(team.key, e.target.value)}
                  className="border border-emerald-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 w-full min-w-0"
                >
                  <option value="">— None —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {isSaving && <span className="text-xs text-slate-400 shrink-0">...</span>}
                {isSaved && <span className="text-xs text-green-600 shrink-0">✓</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
