'use client'

import { useState } from 'react'

interface Props {
  lastWeekUtil:           { pct: number; hoursLogged: number; effectiveCapacity: number }
  pastWeeklyUtil:         Array<{ label: string; pct: number }>
  projectedCurrentWeekPct: number
  projectedByWeek:        Array<{ label: string; hours: number }>
  employeeCount:          number
}

function dialColor(pct: number) {
  if (pct >= 100) return '#ef4444'
  if (pct >= 80)  return '#f97316'
  if (pct >= 50)  return '#eab308'
  return '#22c55e'
}

export default function DashboardInsights({
  lastWeekUtil, pastWeeklyUtil, projectedCurrentWeekPct, projectedByWeek, employeeCount,
}: Props) {
  const [mode, setMode] = useState<'past' | 'future'>('past')

  const isPast      = mode === 'past'
  const dialPct     = isPast ? lastWeekUtil.pct : projectedCurrentWeekPct
  const color       = dialColor(dialPct)
  const radius      = 46
  const sw          = 10
  const circumference = 2 * Math.PI * radius
  const dashOffset  = circumference - (Math.min(dialPct, 100) / 100) * circumference

  // Bar chart data
  const bars = isPast
    ? pastWeeklyUtil.map(w => ({ label: w.label, value: w.pct }))
    : projectedByWeek.map(w => ({ label: w.label, value: w.hours }))

  const refLine   = isPast ? 100 : employeeCount * 40
  const maxValue  = Math.max(...bars.map(b => b.value), refLine, 1)

  function barBg(val: number) {
    if (isPast) {
      if (val >= 100) return 'bg-red-400'
      if (val >= 80)  return 'bg-orange-400'
      if (val >= 50)  return 'bg-blue-400'
      return 'bg-blue-300'
    }
    const avg = employeeCount > 0 ? val / employeeCount : 0
    if (avg >= 30) return 'bg-orange-400'
    if (avg >= 15) return 'bg-blue-400'
    return 'bg-blue-300'
  }

  return (
    <div className="bg-white rounded-lg border p-5 flex items-stretch gap-6">

      {/* ── Circular dial ─────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center shrink-0 w-44">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 text-center">
          Team Utilisation
        </p>

        {/* Clickable dial */}
        <button
          onClick={() => setMode(m => m === 'past' ? 'future' : 'past')}
          className="relative w-28 h-28 rounded-full focus:outline-none hover:opacity-90 transition-opacity cursor-pointer"
          title="Click to toggle past / projected"
        >
          <svg viewBox="0 0 110 110" className="w-full h-full">
            <circle cx="55" cy="55" r={radius} fill="none" stroke="#ccfbf1" strokeWidth={sw} />
            <circle
              cx="55" cy="55" r={radius}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 55 55)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-teal-900 leading-none">{dialPct}%</span>
            <span className="text-slate-400 mt-0.5" style={{ fontSize: '9px' }}>
              {isPast ? 'last week' : 'this week'}
            </span>
          </div>
        </button>

        {/* Mode dots */}
        <div className="flex gap-1.5 mt-2">
          <span className={`w-1.5 h-1.5 rounded-full ${isPast ? 'bg-teal-700' : 'bg-teal-200'}`} />
          <span className={`w-1.5 h-1.5 rounded-full ${!isPast ? 'bg-teal-700' : 'bg-teal-200'}`} />
        </div>

        <p className="text-xs text-slate-400 mt-1.5 text-center leading-relaxed">
          {isPast ? (
            <>{lastWeekUtil.hoursLogged}h logged<br />{lastWeekUtil.effectiveCapacity}h capacity</>
          ) : (
            <>{projectedByWeek[0]?.hours ?? 0}h projected<br />{employeeCount} staff</>
          )}
        </p>
      </div>

      {/* ── Divider ───────────────────────────────────────────── */}
      <div className="w-px bg-emerald-100 shrink-0" />

      {/* ── Bar chart ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
          {isPast
            ? 'Team Utilisation % — Past 12 Weeks'
            : 'Projected Team Hours — Next 12 Weeks'}
        </p>

        <div className="relative flex-1" style={{ height: '96px' }}>

          {/* Reference line */}
          <div
            className="absolute left-0 right-6 flex items-center gap-1 pointer-events-none z-10"
            style={{ bottom: `${Math.min((refLine / maxValue) * 100, 100)}%` }}
          >
            <div className="flex-1 border-t-2 border-dashed border-teal-300" />
            <span className="text-slate-500 font-medium shrink-0" style={{ fontSize: '9px' }}>
              {isPast ? '100%' : `${employeeCount * 40}h`}
            </span>
          </div>

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-1 pr-7">
            {bars.map((b, i) => {
              const heightPct = maxValue > 0 ? (b.value / maxValue) * 100 : 0
              const bg = b.value > 0 ? barBg(b.value) : 'bg-emerald-100'
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0 relative">
                  {b.value > 0 && (
                    <span
                      className="absolute text-teal-700 font-medium leading-none whitespace-nowrap"
                      style={{ bottom: `calc(${Math.max(heightPct, 4)}% + 2px)`, fontSize: '8px' }}
                    >
                      {isPast ? `${b.value}%` : `${b.value}h`}
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t ${bg}`}
                    style={{ height: `${Math.max(heightPct, b.value > 0 ? 4 : 0)}%` }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Week labels */}
        <div className="flex gap-1 mt-1 pr-7">
          {bars.map((b, i) => (
            <div key={i} className="flex-1 min-w-0">
              <span className="block text-center text-slate-400 truncate" style={{ fontSize: '9px' }}>
                {b.label}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-2">
          {isPast
            ? 'Actual hours logged · click dial to switch view'
            : 'Based on active stage schedules · click dial to switch view'}
        </p>
      </div>

    </div>
  )
}
