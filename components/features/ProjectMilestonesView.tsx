import { STAGE_MILESTONES } from '@/lib/milestones'
import StageMilestoneBar from './StageMilestoneBar'
import type { ProjectStage } from '@/lib/types'
import { STAGE_ORDER, STAGE_LABELS } from '@/lib/utilization'
const STATUS_DOT: Record<string, string> = {
  pending:     'bg-emerald-200',
  in_progress: 'bg-blue-500',
  blocked:     'bg-red-500',
  complete:    'bg-green-500',
}

interface Props {
  stages: ProjectStage[]
  notesByStage: Record<string, Record<string, string>>
  projectId: string
}

export default function ProjectMilestonesView({ stages, notesByStage, projectId }: Props) {
  const stageMap = Object.fromEntries(stages.map(s => [s.stage, s]))

  // Only show stages that are currently in_progress
  const activeStages = STAGE_ORDER.filter(
    stageName => stageMap[stageName]?.status === 'in_progress'
  )

  // Overall milestone progress scoped to active stages only
  const totalMilestones = activeStages.reduce((sum, s) => sum + (STAGE_MILESTONES[s]?.length ?? 0), 0)
  const completedMilestones = activeStages.reduce((sum, stageName) => {
    const stage = stageMap[stageName]
    if (!stage) return sum
    const notes = notesByStage[stage.id] ?? {}
    return sum + (STAGE_MILESTONES[stageName] ?? []).filter(m => notes[`ms_${m.key}`] === 'complete').length
  }, 0)
  const overallPct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0

  if (activeStages.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">No stages currently in progress.</p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Overall progress across active stages */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span className="font-medium">Active Stage Milestones</span>
          <span>{completedMilestones}/{totalMilestones} · {overallPct}%</span>
        </div>
        <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Milestone bars for in_progress stages only */}
      <div className="space-y-4">
        {activeStages.map(stageName => {
          const stage = stageMap[stageName]!
          const notes = notesByStage[stage.id] ?? {}

          return (
            <div key={stageName}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-medium text-teal-700">{STAGE_LABELS[stageName]}</span>
              </div>
              <StageMilestoneBar
                stageName={stageName}
                stageId={stage.id}
                projectId={projectId}
                savedNotes={notes}
                readOnly={true}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
