'use client'

import { useState, useEffect } from 'react'
import { fetchUtilizationDetail, type UtilizationDetail } from '@/app/dashboard/utilization-actions'

type Period = 'week' | 'month' | 'year'
type View   = 'employee' | 'project'

interface Props {
  weekStart: string
  onClose:   () => void
}

export default function UtilizationDrilldown({ weekStart, onClose }: Props) {
  const [period,       setPeriod]       = useState<Period>('week')
  const [view,         setView]         = useState<View>('employee')
  const [data,         setData]         = useState<UtilizationDetail | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    setExpandedUser(null)
    fetchUtilizationDetail(weekStart, period).then(res => {
      setLoading(false)
      if (res.error) setError(res.error)
      else           setData(res.data ?? null)
    })
  }, [weekStart, period])

  const maxHours = data
    ? Math.max(
        ...(view === 'employee'
          ? data.byEmployee.map(e => e.totalHours)
          : data.byProject.map(p => p.totalHours)),
        1
      )
    : 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold text-teal-900">Utilization Detail</h2>
            {data && <p className="text-xs text-slate-500 mt-0.5">{data.periodLabel}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* ── Period + View controls ──────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b bg-slate-50">
          <div className="flex gap-1">
            {(['week', 'month', 'year'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['employee', 'project'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  view === v
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {v === 'employee' ? 'By Employee' : 'By Project'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-slate-400">Loading...</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          {data && !loading && (
            <>
              {/* Summary line */}
              <p className="text-xs text-slate-500 mb-3">
                Total logged:{' '}
                <span className="font-semibold text-teal-900">{data.totalHours.toFixed(1)}h</span>
                {' · '}
                {view === 'employee'
                  ? `${data.byEmployee.length} employee${data.byEmployee.length !== 1 ? 's' : ''}`
                  : `${data.byProject.length} project${data.byProject.length !== 1 ? 's' : ''}`}
              </p>

              {/* ── By Employee ─────────────────────────────────── */}
              {view === 'employee' && (
                <div className="space-y-1.5">
                  {data.byEmployee.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-10">
                      No hours logged for this period.
                    </p>
                  )}
                  {data.byEmployee.map(emp => {
                    const isExpanded = expandedUser === emp.userId
                    const barW = `${Math.round((emp.totalHours / maxHours) * 100)}%`
                    return (
                      <div key={emp.userId} className="rounded-lg border border-slate-100 overflow-hidden">
                        {/* Employee row */}
                        <button
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-emerald-50 transition-colors text-left"
                          onClick={() => setExpandedUser(isExpanded ? null : emp.userId)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-teal-900 truncate">
                                {emp.name}
                              </span>
                              <span className="text-sm font-semibold text-teal-900 shrink-0 ml-3">
                                {emp.totalHours.toFixed(1)}h
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-teal-400 rounded-full transition-all"
                                  style={{ width: barW }}
                                />
                              </div>
                              {emp.role && (
                                <span className="text-xs text-slate-400 shrink-0">{emp.role}</span>
                              )}
                              <span className="text-xs text-slate-300 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </div>
                        </button>

                        {/* Project breakdown */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50">
                            {emp.projects
                              .slice()
                              .sort((a, b) => b.hours - a.hours)
                              .map(p => {
                                const pBarW = emp.totalHours > 0
                                  ? `${Math.round((p.hours / emp.totalHours) * 100)}%`
                                  : '0%'
                                const pct = emp.totalHours > 0
                                  ? Math.round((p.hours / emp.totalHours) * 100)
                                  : 0
                                return (
                                  <div
                                    key={p.projectId}
                                    className="flex items-center justify-between px-5 py-2 border-b border-slate-100 last:border-0"
                                  >
                                    <span className="text-xs text-teal-700 truncate flex-1 mr-4">
                                      {p.name}
                                    </span>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-teal-400 rounded-full"
                                          style={{ width: pBarW }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                                      <span className="text-xs font-medium text-teal-900 w-12 text-right">
                                        {p.hours.toFixed(1)}h
                                      </span>
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

              {/* ── By Project ──────────────────────────────────── */}
              {view === 'project' && (
                <div className="space-y-1.5">
                  {data.byProject.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-10">
                      No hours logged for this period.
                    </p>
                  )}
                  {data.byProject.map(proj => {
                    const barW = `${Math.round((proj.totalHours / maxHours) * 100)}%`
                    const pct  = data.totalHours > 0
                      ? Math.round((proj.totalHours / data.totalHours) * 100)
                      : 0
                    return (
                      <div key={proj.projectId} className="px-4 py-3 rounded-lg border border-slate-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-teal-900 truncate flex-1 mr-4">
                            {proj.name}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-400">{pct}%</span>
                            <span className="text-sm font-semibold text-teal-900">
                              {proj.totalHours.toFixed(1)}h
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all"
                            style={{ width: barW }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="px-5 py-2.5 border-t bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400">Work hours only · leave entries excluded</p>
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-teal-700 border border-slate-200 rounded px-3 py-1"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
