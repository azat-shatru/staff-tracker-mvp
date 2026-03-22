'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { updateTimeline } from '@/app/projects/[id]/actions'
import { useRouter } from 'next/navigation'

const STAGES = ['kickoff', 'questionnaire', 'programming', 'fielding', 'templating', 'analysis', 'reporting']

const STAGE_LABELS: Record<string, string> = {
  kickoff: 'Kickoff', questionnaire: 'Questionnaire', programming: 'Programming',
  fielding: 'Fielding', templating: 'Templating', analysis: 'Analysis', reporting: 'Reporting',
}

const STAGE_SHORT: Record<string, string> = {
  kickoff: 'KO', questionnaire: 'QN', programming: 'PG',
  fielding: 'FD', templating: 'TM', analysis: 'AN', reporting: 'RP',
}

const STAGE_COLORS: Record<string, string> = {
  kickoff: '#6366f1', questionnaire: '#8b5cf6', programming: '#a855f7',
  fielding: '#f59e0b', templating: '#10b981', analysis: '#3b82f6', reporting: '#ef4444',
}

// Mirror of STAGE_HOURS[stage].analyst from lib/utilization.ts
const DEFAULT_STAGE_HOURS: Record<string, number> = {
  kickoff: 1, questionnaire: 8, programming: 4,
  fielding: 2, templating: 3, analysis: 4, reporting: 10,
}

const DAY_MS = 86_400_000
const HIST_HEIGHT = 80      // px — total histogram bar area height
const MAX_H_DISPLAY = 20    // h/week that maps to HIST_HEIGHT (bars scale relative to this)
const HOURS_PER_PX = MAX_H_DISPLAY / HIST_HEIGHT   // drag sensitivity

function toMs(d: string): number { return new Date(d).getTime() }
function fromMs(ms: number): string { return new Date(ms).toISOString().split('T')[0] }
function snapDay(ms: number): number { return Math.round(ms / DAY_MS) * DAY_MS }
function todayMs(): number { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }

function fmtDDMM(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function parseDDMM(input: string, startMs: number, endMs: number): string | null {
  const m = input.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10) - 1
  const startYear = new Date(startMs).getFullYear()
  const endYear = new Date(endMs).getFullYear()
  for (let y = startYear; y <= endYear + 1; y++) {
    const d = new Date(y, month, day)
    if (d.getMonth() !== month) continue
    if (d.getTime() >= startMs && d.getTime() <= endMs) return fromMs(d.getTime())
  }
  const fallback = new Date(startYear, month, day)
  return fallback.getMonth() === month ? fromMs(fallback.getTime()) : null
}

function parseAnyDate(s: string): string | null {
  s = s.trim().replace(/\s+/g, ' ')
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return s
  const d = new Date(s)
  if (!isNaN(d.getTime())) return fromMs(d.getTime())
  return null
}

type StageDateMap = Record<string, string>
type StageHoursMap = Record<string, number>

function clampToNeighbors(stage: string, proposedMs: number, dates: StageDateMap): number {
  const idx = STAGES.indexOf(stage)
  const minMs = idx > 0 ? toMs(dates[STAGES[idx - 1]]) : -Infinity
  const maxMs = idx < STAGES.length - 1 ? toMs(dates[STAGES[idx + 1]]) : Infinity
  return Math.max(minMs, Math.min(maxMs, proposedMs))
}

function snapHours(h: number): number {
  return Math.max(0.5, Math.min(40, Math.round(h * 2) / 2))
}

interface Props {
  projectId: string
  kickoffDate: string | null
  targetDate: string | null
  initialStageDates: Record<string, string | null>
  initialStageHours: Record<string, number | null>
  canManage: boolean
}

export default function TimelineEditor({
  projectId, kickoffDate, targetDate,
  initialStageDates, initialStageHours, canManage,
}: Props) {
  const [open, setOpen] = useState(true)
  const [tableOpen, setTableOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedStage, setSelectedStage] = useState<string>(STAGES[0])
  const router = useRouter()
  const trackRef    = useRef<HTMLDivElement>(null)
  // Holds cleanup for any in-progress drag so listeners are removed if the component unmounts mid-drag
  const dragCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => { dragCleanup.current?.() }, [])

  const startMs = useMemo(() => kickoffDate ? toMs(kickoffDate) : todayMs(), [kickoffDate])
  const endMs   = useMemo(() => targetDate ? toMs(targetDate) : startMs + 90 * DAY_MS, [targetDate, startMs])
  const rangeMs = endMs - startMs

  // ── Stage dates ──────────────────────────────────────────────────────────
  const defaultDates = useMemo<StageDateMap>(() => Object.fromEntries(
    STAGES.map((s, i) => {
      const existing = initialStageDates[s]
      if (existing) return [s, existing]
      const pct = STAGES.length === 1 ? 0.5 : i / (STAGES.length - 1)
      return [s, fromMs(snapDay(startMs + pct * rangeMs))]
    })
  ), [initialStageDates, startMs, rangeMs])

  const [stageDates, setStageDates] = useState<StageDateMap>(defaultDates)

  // ── Stage hours ──────────────────────────────────────────────────────────
  const defaultHours = useMemo<StageHoursMap>(() => Object.fromEntries(
    STAGES.map(s => [s, initialStageHours[s] ?? DEFAULT_STAGE_HOURS[s]])
  ), [initialStageHours])

  const [stageHours, setStageHours] = useState<StageHoursMap>(defaultHours)

  // ── Inline date edit ─────────────────────────────────────────────────────
  const [editingStage, setEditingStage] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function commitEdit(stage: string) {
    const parsed = parseDDMM(editValue, startMs, endMs)
    if (parsed) {
      setStageDates(prev => {
        const clamped = clampToNeighbors(stage, toMs(parsed), prev)
        return { ...prev, [stage]: fromMs(clamped) }
      })
    }
    setEditingStage(null)
  }

  // ── Inline hours edit ────────────────────────────────────────────────────
  const [editingHoursStage, setEditingHoursStage] = useState<string | null>(null)
  const [editHoursValue, setEditHoursValue] = useState('')

  function startHoursEdit(stage: string) {
    setEditingHoursStage(stage)
    setEditHoursValue(String(stageHours[stage]))
  }

  function commitHoursEdit(stage: string) {
    const parsed = parseFloat(editHoursValue)
    if (!isNaN(parsed)) setStageHours(prev => ({ ...prev, [stage]: snapHours(parsed) }))
    setEditingHoursStage(null)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const pctFor = useCallback((dateStr: string) => {
    const ms = toMs(dateStr)
    return Math.max(0, Math.min(100, ((ms - startMs) / rangeMs) * 100))
  }, [startMs, rangeMs])

  const dateFromClientX = useCallback((clientX: number) => {
    if (!trackRef.current) return null
    const rect = trackRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    const ms   = snapDay(startMs + (pct / 100) * rangeMs)
    return fromMs(Math.max(startMs, Math.min(endMs, ms)))
  }, [startMs, endMs, rangeMs])

  // ── Axis ticks ───────────────────────────────────────────────────────────
  const axisTicks = useMemo(() => {
    const days = rangeMs / DAY_MS
    const interval = days <= 14 ? 2 : days <= 30 ? 7 : days <= 90 ? 14 : days <= 180 ? 21 : 30
    const ticks: string[] = []
    let cur = startMs
    while (cur <= endMs) { ticks.push(fromMs(cur)); cur += interval * DAY_MS }
    const last = fromMs(endMs)
    if (ticks[ticks.length - 1] !== last) ticks.push(last)
    return ticks
  }, [startMs, endMs, rangeMs])

  // ── Arrow-key date navigation ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      setStageDates(prev => {
        const cur      = toMs(prev[selectedStage])
        const delta    = e.key === 'ArrowLeft' ? -DAY_MS : DAY_MS
        const proposed = Math.max(startMs, Math.min(endMs, cur + delta))
        return { ...prev, [selectedStage]: fromMs(clampToNeighbors(selectedStage, proposed, prev)) }
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, selectedStage, startMs, endMs])

  // ── Drag thumb ───────────────────────────────────────────────────────────
  const handleThumbMouseDown = useCallback((stage: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setSelectedStage(stage)
    const onMove = (ev: MouseEvent) => {
      const d = dateFromClientX(ev.clientX)
      if (d) setStageDates(prev => ({
        ...prev,
        [stage]: fromMs(clampToNeighbors(stage, toMs(d), prev)),
      }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      dragCleanup.current = null
    }
    dragCleanup.current = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [dateFromClientX])

  // ── Drag histogram bar (vertical resize = change hours) ──────────────────
  const handleBarMouseDown = useCallback((stage: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startY     = e.clientY
    const startHours = stageHours[stage]
    const onMove = (ev: MouseEvent) => {
      const deltaY   = startY - ev.clientY   // up = positive = more hours
      const raw      = startHours + deltaY * HOURS_PER_PX
      setStageHours(prev => ({ ...prev, [stage]: snapHours(raw) }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      dragCleanup.current = null
    }
    dragCleanup.current = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [stageHours])

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    await updateTimeline(projectId, stageDates, stageHours)
    setSaving(false)
    router.refresh()
  }

  // ── Paste (table) ────────────────────────────────────────────────────────
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const rows = e.clipboardData.getData('text/plain').trim().split(/\r?\n/).map(r => r.split('\t').map(c => c.trim()))
    const updates: Partial<StageDateMap> = {}
    for (const row of rows) {
      if (row.length < 2) continue
      const [rawStage, rawDate] = row
      if (!rawStage || !rawDate) continue
      const lower = rawStage.toLowerCase()
      if (lower.includes('stage') || lower.includes('name')) continue
      const matched = STAGES.find(s =>
        lower.startsWith(STAGE_LABELS[s].toLowerCase().slice(0, 4)) ||
        STAGE_LABELS[s].toLowerCase().startsWith(lower.slice(0, 4))
      )
      if (matched) {
        const parsed = parseAnyDate(rawDate)
        if (parsed) updates[matched] = parsed
      }
    }
    if (Object.keys(updates).length > 0) {
      setStageDates(prev => {
        const merged = { ...prev, ...updates }
        return STAGES.reduce((acc, s, i) => {
          const proposed = toMs(merged[s] ?? fromMs(startMs))
          const minMs    = i > 0 ? toMs(acc[STAGES[i - 1]]) : startMs
          acc[s] = fromMs(Math.max(minMs, Math.min(endMs, proposed)))
          return acc
        }, { ...prev })
      })
    }
  }

  if (!canManage) return null

  return (
    <div className="mt-4 pt-4 border-t">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(v => !v)}
            className="text-xs text-slate-500 hover:text-teal-900 flex items-center gap-1.5 transition-colors"
          >
            <span>{open ? '▾' : '▸'}</span>
            <span className="font-medium">Edit Timeline</span>
          </button>
          {open && (
            <button
              onClick={() => setTableOpen(v => !v)}
              className="text-xs text-slate-400 hover:text-teal-700 border border-emerald-200 rounded px-2 py-0.5 transition-colors"
            >
              {tableOpen ? 'Hide table' : 'Manual entry'}
            </button>
          )}
        </div>
        {open && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Timeline'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-5 space-y-4">

          {/* ── Stage pills ── */}
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map(s => (
              <button
                key={s}
                onClick={() => setSelectedStage(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
                  selectedStage === s
                    ? 'border-teal-300 bg-emerald-100 text-teal-900 font-semibold shadow-sm'
                    : 'border-emerald-200 text-slate-500 hover:border-emerald-200 hover:text-teal-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLORS[s] }} />
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>

          {/* ── Slider + Histogram ── */}
          <div className="select-none px-1">

            {/* Stage abbreviation labels above thumbs */}
            <div className="relative h-5 mb-1">
              {STAGES.map(s => (
                <div key={s} className="absolute pointer-events-none" style={{ left: `${pctFor(stageDates[s])}%`, transform: 'translateX(-50%)' }}>
                  <span className="block text-center font-mono font-medium" style={{ fontSize: '10px', color: selectedStage === s ? STAGE_COLORS[s] : '#9ca3af' }}>
                    {STAGE_SHORT[s]}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Histogram bars ── */}
            <div className="relative" style={{ height: `${HIST_HEIGHT}px` }}>
              {STAGES.map((s, i) => {
                const leftPct  = i === 0 ? 0 : pctFor(stageDates[STAGES[i - 1]])
                const rightPct = pctFor(stageDates[s])
                const widthPct = rightPct - leftPct
                if (widthPct <= 0.2) return null

                const hours   = stageHours[s]
                const barH    = Math.max(8, Math.min(HIST_HEIGHT - 4, (hours / MAX_H_DISPLAY) * HIST_HEIGHT))
                const isEditH = editingHoursStage === s

                return (
                  <div
                    key={s}
                    className="absolute bottom-0 transition-[height] duration-75"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: `${barH}px`,
                      backgroundColor: `${STAGE_COLORS[s]}1a`,
                      borderTop: `2px solid ${STAGE_COLORS[s]}`,
                      borderLeft:  i > 0 ? `1px solid ${STAGE_COLORS[s]}55` : 'none',
                      borderRight: `1px solid ${STAGE_COLORS[s]}55`,
                      cursor: 'ns-resize',
                    }}
                    onMouseDown={e => handleBarMouseDown(s, e)}
                  >
                    {/* Hours label — centered in bar */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {isEditH ? (
                        <input
                          autoFocus
                          type="number"
                          value={editHoursValue}
                          onChange={e => setEditHoursValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitHoursEdit(s) }
                            if (e.key === 'Escape') setEditingHoursStage(null)
                          }}
                          onBlur={() => commitHoursEdit(s)}
                          min={0.5} max={40} step={0.5}
                          className="w-12 text-center text-xs border rounded px-1 focus:outline-none pointer-events-auto"
                          style={{ color: STAGE_COLORS[s], borderColor: STAGE_COLORS[s], fontSize: '11px', fontWeight: 700 }}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                        />
                      ) : barH >= 18 ? (
                        <span
                          className="font-mono font-semibold pointer-events-auto cursor-text"
                          style={{ fontSize: '11px', color: STAGE_COLORS[s] }}
                          title="Click to edit hours"
                          onClick={e => { e.stopPropagation(); startHoursEdit(s) }}
                          onMouseDown={e => e.stopPropagation()}
                        >
                          {hours % 1 === 0 ? `${hours}h` : `${hours}h`}
                        </span>
                      ) : (
                        /* Bar too short — show label floating above the bar */
                        <span
                          className="absolute font-mono font-semibold pointer-events-auto cursor-text"
                          style={{ fontSize: '10px', color: STAGE_COLORS[s], bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '1px', whiteSpace: 'nowrap' }}
                          title="Click to edit hours"
                          onClick={e => { e.stopPropagation(); startHoursEdit(s) }}
                          onMouseDown={e => e.stopPropagation()}
                        >
                          {hours % 1 === 0 ? `${hours}h` : `${hours}h`}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Hours scale hint (right edge) */}
              <div className="absolute right-0 top-0 flex flex-col justify-between h-full pointer-events-none" style={{ width: '1px' }}>
                <span className="absolute right-1 top-0 text-slate-300 font-mono" style={{ fontSize: '8px' }}>{MAX_H_DISPLAY}h</span>
                <span className="absolute right-1 bottom-0 text-slate-300 font-mono" style={{ fontSize: '8px' }}>0h</span>
              </div>
            </div>

            {/* Track + thumbs */}
            <div ref={trackRef} className="relative h-8 mt-0">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-emerald-100 rounded-full" />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-emerald-200"
                style={{ left: 0, width: `${pctFor(stageDates[STAGES[STAGES.length - 1]])}%` }}
              />
              {STAGES.map(s => {
                const pct        = pctFor(stageDates[s])
                const isSelected = selectedStage === s
                return (
                  <div
                    key={s}
                    className="absolute top-1/2 cursor-grab active:cursor-grabbing"
                    style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)', zIndex: isSelected ? 10 : 5 }}
                    onMouseDown={e => handleThumbMouseDown(s, e)}
                    onClick={() => setSelectedStage(s)}
                  >
                    <div
                      className="rounded-full border-2 border-white shadow-md transition-all duration-100"
                      style={{
                        width: isSelected ? 22 : 16,
                        height: isSelected ? 22 : 16,
                        backgroundColor: STAGE_COLORS[s],
                        outline: isSelected ? `2px solid ${STAGE_COLORS[s]}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  </div>
                )
              })}
            </div>

            {/* Date labels below thumbs — click to type DD/MM */}
            <div className="relative h-9 mt-0.5">
              {STAGES.map(s => {
                const pct        = pctFor(stageDates[s])
                const isSelected = selectedStage === s
                const isEditing  = editingStage === s
                return (
                  <div
                    key={s}
                    className="absolute transition-all duration-150"
                    style={{
                      left: `${pct}%`,
                      top: 0,
                      transform: isEditing ? 'translateX(-50%)' : `translateX(-50%) scale(${isSelected ? 1.45 : 1})`,
                      transformOrigin: 'top center',
                      zIndex: isEditing || isSelected ? 20 : 1,
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(s) }
                          if (e.key === 'Escape') setEditingStage(null)
                        }}
                        onBlur={() => commitEdit(s)}
                        placeholder="dd/mm"
                        maxLength={5}
                        className="w-14 text-center font-mono border rounded px-1 focus:outline-none focus:ring-1"
                        style={{ fontSize: '11px', fontWeight: 700, color: STAGE_COLORS[s], borderColor: STAGE_COLORS[s], boxShadow: `0 0 0 2px ${STAGE_COLORS[s]}22` }}
                      />
                    ) : (
                      <span
                        onClick={() => { setSelectedStage(s); setEditingStage(s); setEditValue(fmtDDMM(stageDates[s])) }}
                        className="block font-mono text-center transition-colors cursor-text"
                        style={{ fontSize: '11px', fontWeight: isSelected ? 700 : 400, color: isSelected ? STAGE_COLORS[s] : '#d1d5db', pointerEvents: 'auto' }}
                        title="Click to type a date (dd/mm)"
                      >
                        {fmtDDMM(stageDates[s])}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Axis ticks */}
            <div className="relative h-6 mt-1 border-t border-emerald-100 pt-1">
              {axisTicks.map(tick => (
                <div key={tick} className="absolute pointer-events-none" style={{ left: `${pctFor(tick)}%`, transform: 'translateX(-50%)' }}>
                  <div className="w-px h-1.5 bg-emerald-200 mx-auto" />
                  <span className="block text-center font-mono text-slate-300" style={{ fontSize: '9px' }}>{fmtDDMM(tick)}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Drag thumb or use <kbd className="font-mono bg-emerald-100 px-1 rounded">←</kbd> <kbd className="font-mono bg-emerald-100 px-1 rounded">→</kbd> to adjust dates · Click a date to type (dd/mm) · Drag a bar up/down or click its label to set expected h/week
            </p>
          </div>

          {/* ── Manual entry table ── */}
          {tableOpen && (
            <div className="border border-emerald-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-50 border-b border-emerald-200">
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Stage</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Delivery Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Exp. h/week</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((s, i) => (
                    <tr key={s} className={`border-b border-emerald-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/50'}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLORS[s] }} />
                          <span className="text-sm text-teal-700">{STAGE_LABELS[s]}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={stageDates[s]}
                          min={fromMs(startMs)} max={fromMs(endMs)}
                          onChange={e => {
                            if (e.target.value) setStageDates(prev => {
                              const clamped = clampToNeighbors(s, toMs(e.target.value), prev)
                              return { ...prev, [s]: fromMs(clamped) }
                            })
                          }}
                          className="text-sm text-teal-700 border border-emerald-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400 w-36"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={stageHours[s]}
                            min={0.5} max={40} step={0.5}
                            onChange={e => {
                              const v = parseFloat(e.target.value)
                              if (!isNaN(v)) setStageHours(prev => ({ ...prev, [s]: snapHours(v) }))
                            }}
                            className="text-sm text-teal-700 border border-emerald-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400 w-16"
                          />
                          <span className="text-xs text-slate-400">h/wk</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Paste zone */}
              <div className="border-t border-emerald-200 p-3 bg-emerald-50">
                <p className="text-xs text-slate-400 mb-1.5">
                  Paste a two-column table (Stage · Delivery Date) from Word or PowerPoint:
                </p>
                <textarea
                  value="" onChange={() => {}}
                  onPaste={handlePaste}
                  rows={2}
                  placeholder="Click here then press Ctrl+V to paste your table…"
                  className="w-full text-xs text-slate-500 placeholder-gray-300 border-2 border-dashed border-emerald-200 rounded-lg p-2 resize-none focus:outline-none focus:border-teal-300 bg-white"
                />
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
