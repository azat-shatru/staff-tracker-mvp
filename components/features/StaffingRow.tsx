'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { UserUtilizationData, StageTimelineItem } from '@/lib/utilization'
import { STAGE_ORDER } from '@/lib/utilization'

interface Props {
  data: UserUtilizationData
  weekCount: number
}

function utilColor(pct: number) {
  if (pct >= 100) return 'text-red-600'
  if (pct >= 80)  return 'text-orange-500'
  if (pct >= 50)  return 'text-yellow-600'
  return 'text-green-600'
}

function utilBarColor(pct: number) {
  if (pct >= 100) return 'bg-red-400'
  if (pct >= 80)  return 'bg-orange-400'
  if (pct >= 50)  return 'bg-yellow-400'
  return 'bg-green-400'
}

function stageStatusDot(status: string) {
  switch (status) {
    case 'complete':    return '●'
    case 'in_progress': return '◐'
    case 'blocked':     return '✕'
    default:            return '○'
  }
}

function stageStatusColor(status: string) {
  switch (status) {
    case 'complete':    return 'text-green-500'
    case 'in_progress': return 'text-blue-500'
    case 'blocked':     return 'text-red-400'
    default:            return 'text-slate-300'
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function StaffingRow({ data, weekCount }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)

  const capacityHours   = data.capacityHours                     // period total (weekCount × user capacity/wk)
  const capacityPerWeek = weekCount > 0 ? capacityHours / weekCount : 40
  const actualPct       = capacityHours > 0 ? Math.round((data.actualHours / capacityHours) * 100) : 0
  const predictedPct    = capacityPerWeek > 0 ? Math.round((data.predictedHoursPerWeek / capacityPerWeek) * 100) : 0

  return (
    <div className="border-b last:border-b-0">
      {/* ── User header row ───────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-emerald-50 select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-xs w-3">{expanded ? '▼' : '▶'}</span>
          <div>
            <span className="font-medium text-teal-900 text-sm">{data.name}</span>
            <span className="ml-2 text-xs text-slate-400">{data.designation || data.role}</span>
          </div>
          {data.projects.length > 0 && (
            <span className="text-xs text-slate-400">
              {(() => { const c = data.projects.filter(p => p.projectStatus === 'active').length; return `${c} project${c !== 1 ? 's' : ''}` })()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Actual utilization */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-12 text-right">Actual</span>
            <div className="w-24 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${utilBarColor(actualPct)}`}
                style={{ width: `${Math.min(actualPct, 100)}%` }}
              />
            </div>
            <span className={`text-xs font-semibold w-10 text-right ${utilColor(actualPct)}`}>
              {actualPct}%
            </span>
          </div>

          {/* Predicted utilization */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-14 text-right">Predicted</span>
            <div className="w-24 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full opacity-60 ${utilBarColor(predictedPct)}`}
                style={{ width: `${Math.min(predictedPct, 100)}%` }}
              />
            </div>
            <span className={`text-xs font-semibold w-10 text-right ${utilColor(predictedPct)}`}>
              {predictedPct}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Expanded: project breakdown ───────────────────────────── */}
      {expanded && (
        <div className="bg-emerald-50 border-t px-5 pb-4 pt-3 space-y-3">
          {data.projects.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No active assignments.</p>
          ) : (
            data.projects.map(project => (
              <div key={project.projectId} className="bg-white border rounded-lg overflow-hidden">
                {/* Project summary row */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-emerald-50"
                  onClick={() => setExpandedProject(expandedProject === project.projectId ? null : project.projectId)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{expandedProject === project.projectId ? '▼' : '▶'}</span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        project.projectStatus === 'active' ? 'bg-green-400' :
                        project.projectStatus === 'on_hold' ? 'bg-yellow-400' : 'bg-emerald-200'
                      }`}
                    />
                    <Link
                      href={`/projects/${project.projectId}`}
                      onClick={e => e.stopPropagation()}
                      className="text-sm font-medium text-teal-900 hover:underline"
                    >
                      {project.projectName}
                    </Link>
                    {project.currentStage && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                        {project.currentStage.charAt(0).toUpperCase() + project.currentStage.slice(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      <span className="font-medium text-teal-700">{project.allocationPct}%</span> alloc
                    </span>
                    <span>
                      ~<span className="font-medium text-teal-700">{project.predictedHoursThisWeek}h</span>/wk predicted
                    </span>
                    {project.actualHoursPeriod > 0 && (
                      <span>
                        <span className="font-medium text-teal-700">{project.actualHoursPeriod}h</span> logged
                      </span>
                    )}
                    {project.projectEndDate && (
                      <span>ends {formatDate(project.projectEndDate)}</span>
                    )}
                  </div>
                </div>

                {/* Stage timeline (expanded) */}
                {expandedProject === project.projectId && (
                  <div className="border-t px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Stage Timeline</p>
                    <div className="space-y-1.5">
                      {project.stageTimeline.map((s, idx) => (
                        <StageTimelineRow
                          key={s.stage}
                          item={s}
                          isLast={idx === project.stageTimeline.length - 1}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2 pt-2 border-t">
                      Role: <span className="text-teal-700">{project.roleLabel || data.role}</span>
                      {project.projectEndDate && (
                        <> · Project ends <span className="text-teal-700">{formatDate(project.projectEndDate)}</span></>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Totals footer */}
          <div className="flex items-center justify-end gap-6 px-1 pt-1 text-xs text-slate-400 border-t">
            <span>
              Logged: <span className="font-medium text-teal-700">{data.actualHours}h</span>
              {' '}/ {capacityHours}h capacity → <span className={`font-semibold ${utilColor(actualPct)}`}>{actualPct}%</span>
            </span>
            <span>
              Predicted: <span className="font-medium text-teal-700">{data.predictedHoursPerWeek}h/wk</span>
              {' '}→ <span className={`font-semibold ${utilColor(predictedPct)}`}>{predictedPct}%</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function StageTimelineRow({ item, isLast }: { item: StageTimelineItem; isLast: boolean }) {
  const isActive = item.status === 'in_progress'
  const isDone   = item.status === 'complete'

  return (
    <div className={`flex items-center gap-3 text-xs ${isDone ? 'opacity-50' : ''}`}>
      {/* Status dot */}
      <span className={`text-base leading-none w-4 text-center ${stageStatusColor(item.status)}`}>
        {stageStatusDot(item.status)}
      </span>

      {/* Stage name */}
      <span className={`w-28 font-medium ${isActive ? 'text-blue-700' : 'text-teal-700'}`}>
        {item.label}
        {isActive && <span className="ml-1 text-blue-400 text-xs">← now</span>}
      </span>

      {/* Date range */}
      <span className="text-slate-400 w-32">
        {formatDate(item.estimatedStart)} → {formatDate(item.estimatedEnd)}
      </span>

      {/* Hours badge */}
      {item.status !== 'complete' && (
        <span className="text-slate-500">
          ~{item.predictedHoursPerWeek}h/wk
        </span>
      )}
    </div>
  )
}
