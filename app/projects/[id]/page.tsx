export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/login/actions'
import StageCard from '@/components/features/StageCard'
import ProjectMilestonesView from '@/components/features/ProjectMilestonesView'
import PocRegistry from '@/components/features/PocRegistry'
import AssignmentsSection from '@/components/features/AssignmentsSection'
import TimelineEditor from '@/components/features/TimelineEditor'
import { getPermissions } from '@/lib/permissions'
import type { ProjectStage, StageNote, Deliverable, User, Role, Assignment } from '@/lib/types'
import { STAGE_ORDER } from '@/lib/utilization'

const STAGE_LABELS: Record<string, string> = {
  kickoff: 'Kickoff', questionnaire: 'Questionnaire', programming: 'Programming',
  fielding: 'Fielding', templating: 'Templating', analysis: 'Analysis', reporting: 'Reporting',
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get current user's role
  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const perms = getPermissions(currentUser?.role as Role | undefined)

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: stages } = await supabase
    .from('project_stages')
    .select('*')
    .eq('project_id', id)

  const stageMap = Object.fromEntries(
    (stages ?? []).map((s: ProjectStage) => [s.stage, s])
  )

  const stageIds = (stages ?? []).map((s: ProjectStage) => s.id)

  const [
    { data: allNotes },
    { data: allDeliverables },
    { data: pocs },
    { data: allUsers },
    { data: assignments },
  ] = await Promise.all([
    stageIds.length
      ? supabase.from('stage_notes').select('*').in('stage_id', stageIds)
      : Promise.resolve({ data: [] }),
    stageIds.length
      ? supabase.from('deliverables').select('*').in('stage_id', stageIds).order('expected_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from('poc_registry').select('*').eq('project_id', id),
    supabase.from('users').select('id, name, role, designation').order('name'),
    supabase.from('assignments').select('*, user:users(id, name, role, designation)').eq('project_id', id),
  ])

  const notesByStage = (allNotes ?? []).reduce((acc: Record<string, Record<string, string>>, note: StageNote) => {
    if (!acc[note.stage_id]) acc[note.stage_id] = {}
    acc[note.stage_id][note.field_key] = note.value
    return acc
  }, {})

  const deliverablesByStage = (allDeliverables ?? []).reduce((acc: Record<string, Deliverable[]>, d: Deliverable) => {
    if (!acc[d.stage_id]) acc[d.stage_id] = []
    acc[d.stage_id].push(d)
    return acc
  }, {})

  // Resolve project manager from users list
  const projectManager = project.project_manager_id
    ? ((allUsers ?? []) as Pick<User, 'id' | 'name' | 'role' | 'designation'>[]).find(u => u.id === project.project_manager_id) ?? null
    : null

  // Exclude manager from the regular assignments list (they're shown as permanent)
  const teamAssignments = ((assignments ?? []) as (Assignment & { user: Pick<User, 'id' | 'name' | 'role' | 'designation'> })[])
    .filter(a => a.user_id !== project.project_manager_id)

  // Extract planned delivery dates saved via the timeline editor
  const initialStageDates = Object.fromEntries(
    STAGE_ORDER.map(stageName => {
      const stage = stageMap[stageName]
      const notes = stage ? (notesByStage[stage.id] ?? {}) : {}
      return [stageName, notes['planned_delivery_date'] ?? null]
    })
  )

  // Extract expected hours/week overrides saved via the timeline editor
  const initialStageHours = Object.fromEntries(
    STAGE_ORDER.map(stageName => {
      const stage = stageMap[stageName]
      const notes = stage ? (notesByStage[stage.id] ?? {}) : {}
      const raw   = notes['expected_hours_per_week']
      return [stageName, raw ? parseFloat(raw) : null]
    })
  )

  const completedCount = (stages ?? []).filter((s: ProjectStage) => s.status === 'complete').length
  const totalStages = STAGE_ORDER.length
  const progressPct = Math.round((completedCount / totalStages) * 100)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700 border-b border-teal-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-teal-100 hover:text-white">← Dashboard</Link>
          <span className="text-teal-400">/</span>
          <h1 className="text-lg font-semibold text-white">{project.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-teal-100">{user?.email}</span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="border-teal-400 text-teal-100 hover:bg-teal-600 hover:border-teal-300 bg-transparent">Sign out</Button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className={`mx-auto ${perms.canManagePoc ? 'max-w-6xl' : 'max-w-4xl'}`}>
          <div className={`flex gap-6 items-start ${perms.canManagePoc ? 'flex-col lg:flex-row' : ''}`}>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-6">

              {/* Project summary */}
              <div className="bg-white rounded-lg border p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-teal-900">{project.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">{project.client} · {project.project_type}</p>
                  </div>
                  <span className="text-sm text-slate-500">
                    {formatDate(project.kickoff_date)} → {formatDate(project.target_delivery_date)}
                  </span>
                </div>

                {/* Stage progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>{completedCount} of {totalStages} stages complete</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Milestone overview (read-only, in-progress stages only) */}
                <div className="mt-5 pt-5 border-t">
                  <ProjectMilestonesView
                    stages={stages ?? []}
                    notesByStage={notesByStage}
                    projectId={id}
                  />
                </div>

                {/* Timeline editor */}
                <TimelineEditor
                  projectId={id}
                  kickoffDate={project.kickoff_date}
                  targetDate={project.target_delivery_date}
                  initialStageDates={initialStageDates}
                  initialStageHours={initialStageHours}
                  canManage={perms.canManagePoc}
                />
              </div>

              {/* Stages */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Project Stages</h3>
                {STAGE_ORDER.map((stageName, index) => {
                  const stage = stageMap[stageName]
                  return (
                    <StageCard
                      key={stageName}
                      stage={stage}
                      stageName={stageName}
                      stageLabel={STAGE_LABELS[stageName]}
                      stageNumber={index + 1}
                      projectId={id}
                      savedNotes={stage ? (notesByStage[stage.id] ?? {}) : {}}
                      deliverables={stage ? (deliverablesByStage[stage.id] ?? []) : []}
                      canTransition={perms.canTransitionStage}
                      canRemove={perms.canRemoveStage}
                      canEdit={perms.canEditNotes}
                      canToggleMilestone={perms.canToggleMilestone}
                    />
                  )
                })}
              </div>

            </div>

            {/* Right sidebar — managers only */}
            {perms.canManagePoc && (
              <div className="w-full lg:w-72 shrink-0 space-y-4">
                <div className="bg-white rounded-lg border p-5 lg:sticky lg:top-6 space-y-6">
                  <PocRegistry
                    projectId={id}
                    users={(allUsers ?? []) as User[]}
                    pocs={(pocs ?? []).map((p: { team_name: string; user_id: string | null }) => ({
                      team_name: p.team_name,
                      user_id: p.user_id,
                    }))}
                  />
                  <div className="border-t pt-5">
                    <AssignmentsSection
                      projectId={id}
                      projectManager={projectManager}
                      assignments={teamAssignments}
                      users={(allUsers ?? []) as Pick<User, 'id' | 'name' | 'role' | 'designation'>[]}
                      canManage={perms.canManagePoc}
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}
