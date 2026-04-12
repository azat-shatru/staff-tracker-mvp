'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Project } from '@/lib/types'
import { ROLE_DISPLAY } from '@/lib/types'

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  on_hold:  'bg-yellow-100 text-yellow-700',
  complete: 'bg-blue-100 text-blue-700',
  archived: 'bg-emerald-100 text-slate-500',
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type EfficiencyStatus =
  | { label: 'On Track';          style: string }
  | { label: 'At Risk';           style: string }
  | { label: 'Overdue';           style: string }
  | { label: 'Delivered On Time'; style: string }
  | { label: 'Delivered Late';    style: string }
  | null

function getEfficiency(project: Project, reportingCompletedAt: string | null): EfficiencyStatus {
  if (!project.target_delivery_date) return null

  const target = new Date(project.target_delivery_date)
  const today  = new Date()
  today.setHours(0, 0, 0, 0)

  if (project.status === 'complete' || project.status === 'archived') {
    if (!reportingCompletedAt) return null
    const completed = new Date(reportingCompletedAt)
    return completed <= target
      ? { label: 'Delivered On Time', style: 'bg-green-100 text-green-700' }
      : { label: 'Delivered Late',    style: 'bg-red-100 text-red-700' }
  }

  const daysLeft = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0)  return { label: 'Overdue',  style: 'bg-red-100 text-red-700' }
  if (daysLeft <= 7) return { label: 'At Risk',   style: 'bg-orange-100 text-orange-700' }
  return               { label: 'On Track',       style: 'bg-emerald-100 text-emerald-700' }
}

type MemberRow = {
  user_id: string
  role_label: string
  allocation_pct: number
  user: { id: string; name: string; role: string } | null
}

type ProjectListProps = {
  recentProjects: Project[]
  olderProjects:  Project[]
  membersByProject: Record<string, MemberRow[]>
  reportingDoneAt:  Record<string, string>
}

const SHOW = 3

function ProjectTile({
  project,
  membersByProject,
  reportingDoneAt,
}: {
  project: Project
  membersByProject: Record<string, MemberRow[]>
  reportingDoneAt: Record<string, string>
}) {
  const eff     = getEfficiency(project, reportingDoneAt[project.id] ?? null)
  const members = membersByProject[project.id] ?? []

  return (
    <Link
      key={project.id}
      href={`/projects/${project.id}`}
      className="flex items-center justify-between px-5 py-4 hover:bg-emerald-50 transition-colors"
    >
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-teal-900">{project.name}</span>
        <span className="text-sm text-slate-500">{project.client} · {project.project_type}</span>
        {members.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {members.slice(0, SHOW).map(m => (
              <span
                key={m.user_id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 rounded text-xs text-teal-700"
                title={`${m.role_label || (ROLE_DISPLAY[m.user?.role ?? ''] ?? m.user?.role ?? '')} · ${m.allocation_pct}%`}
              >
                {m.user?.name ?? '—'}
                <span className="text-slate-400">{m.allocation_pct}%</span>
              </span>
            ))}
            {members.length > SHOW && (
              <span className="text-xs text-slate-400">+{members.length - SHOW} more</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-500 shrink-0 ml-4">
        <span className="text-xs">Kickoff: {formatDate(project.kickoff_date)}</span>
        <span className="text-xs">Delivery: {formatDate(project.target_delivery_date)}</span>
        {eff && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${eff.style}`}>
            {eff.label}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[project.status]}`}>
          {project.status.replace('_', ' ')}
        </span>
      </div>
    </Link>
  )
}

export default function ProjectList({
  recentProjects,
  olderProjects,
  membersByProject,
  reportingDoneAt,
}: ProjectListProps) {
  const [showOlder, setShowOlder] = useState(false)

  const hasOlder = olderProjects.length > 0

  return (
    <div className="bg-white rounded-lg border divide-y">
      {recentProjects.length === 0 && !hasOlder && (
        <div className="p-12 text-center text-slate-400">
          <p className="text-sm">No projects yet. Create your first project to get started.</p>
        </div>
      )}

      {recentProjects.map(project => (
        <ProjectTile
          key={project.id}
          project={project}
          membersByProject={membersByProject}
          reportingDoneAt={reportingDoneAt}
        />
      ))}

      {hasOlder && (
        <>
          <button
            onClick={() => setShowOlder(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <span className="text-sm text-slate-500">
              {olderProjects.length} older project{olderProjects.length !== 1 ? 's' : ''} — no activity this week
            </span>
            <span className="text-sm font-medium text-teal-600 flex items-center gap-1">
              {showOlder ? 'Collapse' : 'Show all'}
              <svg
                className={`w-4 h-4 transition-transform ${showOlder ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {showOlder && olderProjects.map(project => (
            <ProjectTile
              key={project.id}
              project={project}
              membersByProject={membersByProject}
              reportingDoneAt={reportingDoneAt}
            />
          ))}
        </>
      )}
    </div>
  )
}
