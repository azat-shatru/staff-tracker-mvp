'use client'

import { useState } from 'react'
import type { UtilizationDetail } from '@/app/dashboard/utilization-actions'

type View = 'employee' | 'project'

export default function UtilizationDetailView({ data }: { data: UtilizationDetail }) {
  const [view,         setView]         = useState<View>('employee')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  const maxHours = Math.max(
    ...(view === 'employee'
      ? data.byEmployee.map(e => e.totalHours)
      : data.byProject.map(p => p.totalHours)),
    1
  )

  return (
    <div className="space-y-4">

      {/* View toggle */}
      <div className="flex gap-1 bg-white border rounded-lg p-1 w-fit">
        {(['employee', 'project'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              view === v
                ? 'bg-teal-600 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {v === 'employee' ? 'By Employee' : 'By Project'}
          </button>
        ))}
      </div>

      {/* ── By Employee ──────────────────────────────────────────── */}
      {view === 'employee' && (
        <div className="space-y-2">
          {data.byEmployee.length === 0 && (
            <div className="bg-white rounded-lg border p-12 text-center text-slate-400 text-sm">
              No hours logged for this period.
            </div>
          )}
          {data.byEmployee.map(emp => {
            const isExpanded = expandedUser === emp.userId
            const barW = `${Math.round((emp.totalHours / maxHours) * 100)}%`

            return (
              <div key={emp.userId} className="bg-white rounded-lg border overflow-hidden">
                {/* Employee header row */}
                <button
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-emerald-50 transition-colors text-left"
                  onClick={() => setExpandedUser(isExpanded ? null : emp.userId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-semibold text-teal-900">{emp.name}</span>
                        {emp.role && (
                          <span className="ml-2 text-xs text-slate-400">{emp.role}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs text-slate-400">
                          {emp.projects.length} project{emp.projects.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-base font-bold text-teal-900">
                          {emp.totalHours.toFixed(1)}h
                        </span>
                        <span className="text-xs text-slate-300">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-400 rounded-full transition-all"
                        style={{ width: barW }}
                      />
                    </div>
                  </div>
                </button>

                {/* Project breakdown */}
                {isExpanded && (
                  <div className="border-t divide-y bg-slate-50">
                    <div className="grid grid-cols-[1fr_80px_60px_64px] px-5 py-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
                      <span>Project</span>
                      <span className="text-right">Hours</span>
                      <span className="text-right">Share</span>
                      <span />
                    </div>
                    {emp.projects
                      .slice()
                      .sort((a, b) => b.hours - a.hours)
                      .map(p => {
                        const pct   = emp.totalHours > 0 ? Math.round((p.hours / emp.totalHours) * 100) : 0
                        const pBarW = `${pct}%`
                        return (
                          <div key={p.projectId} className="grid grid-cols-[1fr_80px_60px_64px] items-center px-5 py-3">
                            <span className="text-sm text-teal-700 truncate pr-4">{p.name}</span>
                            <span className="text-sm font-semibold text-teal-900 text-right">
                              {p.hours.toFixed(1)}h
                            </span>
                            <span className="text-xs text-slate-500 text-right">{pct}%</span>
                            <div className="pl-3">
                              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-teal-400 rounded-full" style={{ width: pBarW }} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── By Project ───────────────────────────────────────────── */}
      {view === 'project' && (
        <div className="space-y-2">
          {data.byProject.length === 0 && (
            <div className="bg-white rounded-lg border p-12 text-center text-slate-400 text-sm">
              No hours logged for this period.
            </div>
          )}
          {data.byProject.map(proj => {
            const barW = `${Math.round((proj.totalHours / maxHours) * 100)}%`
            const pct  = data.totalHours > 0 ? Math.round((proj.totalHours / data.totalHours) * 100) : 0
            return (
              <div key={proj.projectId} className="bg-white rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-teal-900 truncate flex-1 mr-6">
                    {proj.name}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">{pct}% of total</span>
                    <span className="text-base font-bold text-teal-900">
                      {proj.totalHours.toFixed(1)}h
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: barW }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 pt-1">Work hours only · leave entries excluded</p>
    </div>
  )
}
