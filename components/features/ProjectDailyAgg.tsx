'use client'

import { useState } from 'react'
import type { ProjectGroup } from '@/lib/build-project-groups'


interface Props {
  groups: ProjectGroup[]
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

const PRIORITY_LABELS = ['', 'Low', 'Med-low', 'Medium', 'Med-high', 'High']
const PRIORITY_COLORS = ['', '#7BA76A', '#B5B458', '#D8A745', '#D27A35', '#C23925']

export default function ProjectDailyAgg({ groups }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (groups.length === 0) return null

  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        Daily plan — this week by project
      </h3>
      <div className="space-y-2">
        {groups.map(g => (
          <div key={g.project_id} className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggle(g.project_id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm text-slate-800">{g.project_name}</span>
                <span className="text-xs font-mono text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  {g.totalHours}h planned this week
                </span>
              </div>
              <span className="text-slate-400 text-xs font-mono">
                {expanded[g.project_id] ? '▲' : '▼'} {g.days.length} {g.days.length === 1 ? 'day' : 'days'}
              </span>
            </button>

            {expanded[g.project_id] && (
              <div className="border-t border-slate-100">
                {g.days.map((day, i) => (
                  <div
                    key={day.log_date}
                    className={`flex items-center gap-4 px-4 py-2.5 text-sm ${i < g.days.length - 1 ? 'border-b border-slate-100' : ''}`}
                    style={{ background: '#FAFAFA' }}
                  >
                    <span className="w-28 text-slate-500 font-mono text-xs shrink-0">{fmtDate(day.log_date)}</span>
                    <span className="font-medium text-teal-700 shrink-0">{day.hours}h</span>
                    {day.phase && (
                      <span className="text-slate-500 text-xs bg-slate-100 px-2 py-0.5 rounded shrink-0">{day.phase}</span>
                    )}
                    {day.priority && (
                      <span
                        className="text-xs px-2 py-0.5 rounded shrink-0"
                        style={{
                          background: PRIORITY_COLORS[day.priority] + '22',
                          color: PRIORITY_COLORS[day.priority],
                          border: `1px solid ${PRIORITY_COLORS[day.priority]}44`,
                        }}
                      >
                        {PRIORITY_LABELS[day.priority]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

