export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getPermissions } from '@/lib/permissions'
import { STAGE_HOURS, STAGE_LABELS } from '@/lib/utilization'
import type { Role } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'

const STAGE_STATUS_STYLES: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  blocked:     'bg-red-100 text-red-700',
}

function hoursColor(hours: number) {
  if (hours >= 35) return 'text-red-600'
  if (hours >= 25) return 'text-orange-500'
  if (hours >= 15) return 'text-yellow-600'
  return 'text-green-600'
}

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)

  const [
    { data: allUsers },
    { data: allAssignments },
    { data: inProgressStages },
  ] = await Promise.all([
    supabase.from('users').select('id, name, role').order('name').limit(500),
    supabase
      .from('assignments')
      .select('user_id, project_id, role_label, allocation_pct, project:projects(id, name, client, status)').limit(1000),
    supabase
      .from('project_stages')
      .select('project_id, stage, status')
      .in('status', ['in_progress', 'blocked']),
  ])

  // Index: project_id → current stage info
  type StageRow = { project_id: string; stage: string; status: string }
  const currentStageByProject: Record<string, StageRow> = {}
  for (const s of (inProgressStages ?? []) as StageRow[]) {
    // keep first in_progress; don't overwrite with blocked
    if (!currentStageByProject[s.project_id] || s.status === 'in_progress') {
      currentStageByProject[s.project_id] = s
    }
  }

  // Index: user_id → assignments
  type AssignmentRow = {
    user_id: string
    project_id: string
    role_label: string
    allocation_pct: number
    project: { id: string; name: string; client: string; status: string } | null
  }
  const assignmentsByUser: Record<string, AssignmentRow[]> = {}
  for (const a of (allAssignments ?? []) as unknown as AssignmentRow[]) {
    if (!a.project) continue
    if (!assignmentsByUser[a.user_id]) assignmentsByUser[a.user_id] = []
    // Deduplicate: if this project already exists for this user, keep higher allocation
    const existing = assignmentsByUser[a.user_id].findIndex(x => x.project_id === a.project_id)
    if (existing >= 0) {
      if (a.allocation_pct > assignmentsByUser[a.user_id][existing].allocation_pct) {
        assignmentsByUser[a.user_id][existing] = a
      }
    } else {
      assignmentsByUser[a.user_id].push(a)
    }
  }

  type UserRow = { id: string; name: string; role: string }

  // Build per-employee data
  const teamData = ((allUsers ?? []) as UserRow[]).map(u => {
    const assignments = assignmentsByUser[u.id] ?? []

    const activeWork = assignments
      .filter(a => a.project?.status === 'active' || a.project?.status === 'on_hold')
      .map(a => {
        const stageInfo = currentStageByProject[a.project_id]
        const currentStage = stageInfo?.stage ?? null
        const totalProjectHours = currentStage ? (STAGE_HOURS[currentStage] ?? 0) : 0
        const projectedHours = +(totalProjectHours * (a.allocation_pct / 100)).toFixed(1)
        return {
          projectId:      a.project!.id,
          projectName:    a.project!.name,
          client:         a.project!.client,
          projectStatus:  a.project!.status,
          allocationPct:  a.allocation_pct,
          roleLabel:      a.role_label,
          currentStage,
          stageStatus:    stageInfo?.status ?? null,
          projectedHours,
        }
      })

    const totalProjectedHours = +activeWork
      .reduce((sum, w) => sum + w.projectedHours, 0)
      .toFixed(1)

    return { user: u, activeWork, totalProjectedHours }
  })

  const staffedCount   = teamData.filter(d => d.activeWork.length > 0).length
  const availableCount = teamData.filter(d => d.activeWork.length === 0).length
  const totalNextWeekHours = +teamData
    .reduce((sum, d) => sum + d.totalProjectedHours, 0)
    .toFixed(0)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-teal-100 hover:text-white">← Dashboard</Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">Team Overview</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-teal-100">
            {currentUser?.name ?? user?.email}
            <span className="ml-1.5 px-1.5 py-0.5 bg-teal-600 text-teal-100 rounded text-xs">
              {ROLE_DISPLAY[currentUser?.role ?? ''] ?? currentUser?.role ?? ''}
            </span>
          </span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="border-teal-400 text-teal-100 hover:bg-teal-600 hover:border-teal-300 bg-transparent">Sign out</Button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Currently Staffed</p>
              <p className="text-2xl font-semibold text-teal-900">{staffedCount}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Available</p>
              <p className="text-2xl font-semibold text-teal-900">{availableCount}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Projected Hrs Next Week</p>
              <p className="text-2xl font-semibold text-teal-900">{totalNextWeekHours}h</p>
            </div>
          </div>

          {/* Team table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-teal-900">Staffing — Next Week</h2>
            </div>

            <div className="divide-y">
              {teamData.map(({ user: u, activeWork, totalProjectedHours }) => (
                <div key={u.id} className="px-5 py-4">
                  {/* Employee header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-teal-900 text-sm">{u.name}</span>
                      <span className="text-xs text-slate-400">{ROLE_DISPLAY[u.role] ?? u.role}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {activeWork.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">No active assignments</span>
                      ) : (
                        <span className={`text-sm font-semibold ${hoursColor(totalProjectedHours)}`}>
                          {totalProjectedHours}h next week
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Project rows */}
                  {activeWork.length > 0 && (
                    <div className="space-y-1.5 ml-0">
                      {activeWork.map(w => (
                        <div key={w.projectId} className="flex items-center gap-3 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.projectStatus === 'active' ? 'bg-green-400' : 'bg-yellow-400'}`} />

                          <Link
                            href={`/projects/${w.projectId}`}
                            className="text-teal-700 hover:text-teal-900 hover:underline font-medium w-48 truncate shrink-0"
                          >
                            {w.projectName}
                          </Link>

                          <span className="text-slate-400 shrink-0">{w.client}</span>

                          <span className="text-slate-300 shrink-0">·</span>

                          {w.currentStage ? (
                            <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 ${STAGE_STATUS_STYLES[w.stageStatus ?? ''] ?? 'bg-emerald-100 text-slate-500'}`}>
                              {STAGE_LABELS[w.currentStage]}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-slate-400 shrink-0">
                              No active stage
                            </span>
                          )}

                          <span className="text-slate-300 shrink-0">·</span>

                          <span className={`font-semibold shrink-0 ${hoursColor(w.projectedHours)}`}>
                            {w.projectedHours}h/wk
                          </span>

                          <span className="text-slate-400 shrink-0">
                            ({w.allocationPct}% alloc{w.roleLabel ? ` · ${w.roleLabel}` : ''})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
