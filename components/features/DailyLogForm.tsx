'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { saveDailyLog } from '@/app/daily-log/actions'
import { DAILY_PHASES, WORK_START_MIN, WORK_END_MIN, WORK_HOURS } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = { id: string; name: string; status: string; created_at?: string }

type Block = {
  tempId: string
  start_min: number
  end_min: number
  project_id: string | null
  phase: string | null
  priority: number | null
  deliverable: boolean
}

interface Props {
  currentUserName: string
  today: string
  todayLog: { id: string; status: string; submitted_at: string | null } | null
  todaySlots: {
    start_min: number
    end_min: number
    project_id: string | null
    phase: string | null
    priority: number | null
    deliverable: boolean
    project?: { id: string; name: string } | null
  }[]
  myProjects: Project[]
  weekLogs: { id: string; log_date: string; status: string; submitted_at: string | null }[]
  weekSlots: {
    log_id: string
    start_min: number
    end_min: number
    project_id: string | null
    phase: string | null
    priority: number | null
    project?: { id: string; name: string } | null
  }[]
}

// ─── Calendar constants ────────────────────────────────────────────────────────

const SLOT_MIN    = 30
const TOTAL_SLOTS = (WORK_END_MIN - WORK_START_MIN) / SLOT_MIN   // 18
const ROW_H       = 60   // px per 30-min slot

// Column widths for the calendar grid
const COL_TIME     = 64   // time-axis labels
const COL_PHASE    = 210  // phase dropdown
const COL_PRIORITY = 180  // 5-segment priority bar
const COL_DEL      = 110  // deliverable toggle

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(min: number) {
  const h   = Math.floor(min / 60) % 24   // 1440 → 0 (midnight)
  const m   = min % 60
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const ap  = h >= 12 ? 'pm' : 'am'
  return m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}${ap}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function timeAgo(iso: string | null) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function minToPx(min: number) {
  return ((min - WORK_START_MIN) / SLOT_MIN) * ROW_H
}

function pxToSnapMin(px: number) {
  return Math.round(px / ROW_H) * SLOT_MIN + WORK_START_MIN
}

function initBlocks(todaySlots: Props['todaySlots']): Block[] {
  return todaySlots
    .filter(s => s.start_min != null && s.end_min != null)
    .map(s => ({
      tempId:      Math.random().toString(36).slice(2),
      start_min:   s.start_min,
      end_min:     s.end_min,
      project_id:  s.project_id,
      phase:       s.phase,
      priority:    s.priority,
      deliverable: s.deliverable ?? false,
    }))
    .sort((a, b) => a.start_min - b.start_min)
}

const STATUS_META = {
  WFO: { label: 'In office',         bg: '#E6E0D2', color: '#1F1B16' },
  WFH: { label: 'Working from home', bg: '#DDE5D5', color: '#4E6843' },
  OOO: { label: 'Out of office',     bg: '#F2DBD0', color: '#B85333' },
} as const

const PRIORITY_COLORS = ['', '#7BA76A', '#B5B458', '#D8A745', '#D27A35', '#C23925']

// ─── Main component ───────────────────────────────────────────────────────────

export default function DailyLogForm({
  currentUserName, today,
  todayLog, todaySlots, myProjects,
  weekLogs, weekSlots,
}: Props) {
  const [status, setStatus] = useState<'WFO' | 'WFH'>(
    (todayLog?.status === 'WFO' || todayLog?.status === 'WFH') ? todayLog.status : 'WFO'
  )
  const [blocks, setBlocks]     = useState<Block[]>(() => initBlocks(todaySlots))
  const [saved, setSaved]       = useState<string | null>(todayLog?.submitted_at ?? null)
  const [error, setError]       = useState<string | null>(null)
  const [histOpen, setHistOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Drag-resize state via ref to avoid stale closures
  const dragRef = useRef<{
    blockTempId: string
    startY: number
    startEndMin: number
    nextStart: number
    blockStartMin: number
  } | null>(null)

  useEffect(() => {
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const { blockTempId, startY, startEndMin, nextStart, blockStartMin } = dragRef.current
      const deltaMin = Math.round((ev.clientY - startY) / ROW_H) * SLOT_MIN
      const rawEnd   = startEndMin + deltaMin
      const newEnd   = Math.max(blockStartMin + SLOT_MIN, Math.min(nextStart, rawEnd))
      setBlocks(prev => prev.map(b => b.tempId === blockTempId ? { ...b, end_min: newEnd } : b))
    }
    const handleUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const billingHours = useMemo(() =>
    blocks
      .filter(b => b.project_id)
      .reduce((sum, b) => sum + (b.end_min - b.start_min) / 60, 0),
    [blocks]
  )
  const freeHours     = Math.max(0, WORK_HOURS - billingHours)
  const workloadLabel = billingHours <= 3 ? 'Light' : billingHours <= 6 ? 'Busy' : 'Heavy'
  const workloadColors = {
    Light: { bg: '#D7E8CC', color: '#3F7233' },
    Busy:  { bg: '#F2E2BD', color: '#9A6B14' },
    Heavy: { bg: '#F2C9C0', color: '#9B2C25' },
  }[workloadLabel]!

  const currentHour = new Date().getHours()

  // ── Block helpers ──────────────────────────────────────────────────────────
  const updateBlock = (tempId: string, patch: Partial<Block>) =>
    setBlocks(prev => prev.map(b => b.tempId === tempId ? { ...b, ...patch } : b))

  const deleteBlock = (tempId: string) =>
    setBlocks(prev => prev.filter(b => b.tempId !== tempId))

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rawMin = pxToSnapMin(e.clientY - rect.top)
    const startMin = Math.max(WORK_START_MIN, Math.min(WORK_END_MIN - SLOT_MIN, rawMin))
    if (blocks.some(b => b.start_min <= startMin && b.end_min > startMin)) return
    const nextBlock = [...blocks].sort((a, b) => a.start_min - b.start_min).find(b => b.start_min > startMin)
    const endMin = Math.min(WORK_END_MIN, nextBlock ? Math.min(nextBlock.start_min, startMin + 60) : startMin + 60)
    setBlocks(prev => [...prev, {
      tempId: Math.random().toString(36).slice(2),
      start_min: startMin, end_min: endMin,
      project_id: null, phase: null, priority: null, deliverable: false,
    }].sort((a, b) => a.start_min - b.start_min))
  }

  const handleResizeStart = (e: React.MouseEvent, tempId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const block = blocks.find(b => b.tempId === tempId)
    if (!block) return
    const nextStart = blocks
      .filter(b => b.start_min >= block.end_min)
      .sort((a, b) => a.start_min - b.start_min)[0]?.start_min ?? WORK_END_MIN
    dragRef.current = {
      blockTempId: tempId,
      startY: e.clientY,
      startEndMin: block.end_min,
      nextStart,
      blockStartMin: block.start_min,
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const payload = blocks.map(b => ({
        start_min:   b.start_min,
        end_min:     b.end_min,
        project_id:  b.project_id,
        phase:       b.phase,
        priority:    b.priority,
        deliverable: b.deliverable,
      }))
      const res = await saveDailyLog(status, payload, today)
      if (res.error) { setError(res.error); return }
      setSaved(new Date().toISOString())
    })
  }

  // ── Week history ───────────────────────────────────────────────────────────
  const slotsByLogId = useMemo(() => {
    const map: Record<string, typeof weekSlots> = {}
    for (const s of weekSlots) {
      if (!map[s.log_id]) map[s.log_id] = []
      map[s.log_id].push(s)
    }
    return map
  }, [weekSlots])

  // ── Day shape: 18 half-hour segments 11am–8pm ──────────────────────────────
  const daySegments = Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
    const segStart = WORK_START_MIN + i * SLOT_MIN
    const segEnd   = segStart + SLOT_MIN
    return blocks.some(b => b.project_id && b.start_min < segEnd && b.end_min > segStart)
  })

  return (
    <div className="min-h-screen" style={{ background: '#F4EFE6', fontFamily: "'DM Sans', ui-sans-serif, sans-serif", color: '#1F1B16' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .dp-serif { font-family: 'Fraunces', ui-serif, Georgia, serif; }
        .dp-mono  { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .resize-handle:hover { opacity: 1 !important; }
      `}</style>

      {/* Header */}
      <header className="w-full border-b border-stone-300/60" style={{ background: '#FAF6EE' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="dp-serif text-xl font-medium">Daily Log</span>
            <span className="ml-3 dp-mono text-[11px] text-stone-500 uppercase tracking-wider">
              {fmtDate(today)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/team-status" className="text-sm text-stone-500 hover:text-stone-900 transition">Team status →</a>
            <a href="/dashboard" className="text-sm text-stone-500 hover:text-stone-900 transition">← Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-32 pt-8">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="dp-serif text-3xl font-light">
            Good {currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'evening'},{' '}
            <em className="not-italic font-medium" style={{ color: '#C85C3C' }}>
              {currentUserName.split(' ')[0]}
            </em>.
          </h1>
          {saved && (
            <p className="mt-1 dp-mono text-[11px] text-stone-500">✓ Plan saved {timeAgo(saved)}</p>
          )}
        </div>

        {/* ── 01: Working status ── */}
        <Section num="01" title="Working status today">
          <div className="flex gap-3">
            {(['WFO', 'WFH'] as const).map(s => {
              const meta   = STATUS_META[s]
              const active = status === s
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className="px-5 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                  style={{
                    borderColor: active ? meta.color : '#D4CFC2',
                    background:  active ? meta.bg   : '#FAF6EE',
                    color:       active ? meta.color : '#574F44',
                  }}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </Section>

        {/* ── 02: Calendar plan ── */}
        <Section num="02" title="Today's plan">
          <p className="text-sm text-stone-500 mb-4">
            Click the timeline to add a block, then drag its bottom edge to resize. Snaps to 30-minute increments.
          </p>

          {myProjects.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-stone-300 text-center text-stone-500 italic text-sm">
              You have no active project assignments. Ask your manager to staff you on a project.
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 overflow-hidden" style={{ background: '#FAF6EE', minWidth: COL_TIME + 480 }}>

              {/* Column headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `${COL_TIME}px 1fr ${COL_PHASE}px ${COL_PRIORITY}px ${COL_DEL}px`,
                  background: '#F0EBE0',
                  borderBottom: '1px solid #D4CFC2',
                }}
              >
                <div className="px-3 py-2.5 dp-mono text-[10px] uppercase tracking-wider text-stone-500">Time</div>
                <div className="px-3 py-2.5 dp-mono text-[10px] uppercase tracking-wider text-stone-500">Project</div>
                <div className="px-3 py-2.5 dp-mono text-[10px] uppercase tracking-wider text-stone-500">Phase</div>
                <div className="px-3 py-2.5 dp-mono text-[10px] uppercase tracking-wider text-stone-500 text-center">Priority</div>
                <div className="px-3 py-2.5 dp-mono text-[10px] uppercase tracking-wider text-stone-500 text-center flex items-center justify-between">
                  <span>Deliverable</span>
                  {blocks.length > 0 && (
                    <button
                      onClick={() => setBlocks([])}
                      className="dp-mono text-[9px] text-stone-400 hover:text-red-500 transition normal-case tracking-normal"
                    >clear</button>
                  )}
                </div>
              </div>

              {/* Calendar grid */}
              <div className="relative select-none" style={{ height: TOTAL_SLOTS * ROW_H + 1 }}>

                {/* Grid lines + time labels */}
                {Array.from({ length: TOTAL_SLOTS + 1 }).map((_, i) => {
                  const min    = WORK_START_MIN + i * SLOT_MIN
                  const isHour = min % 60 === 0
                  const top    = i * ROW_H
                  return (
                    <div key={min} className="absolute left-0 right-0 pointer-events-none flex" style={{ top }}>
                      <div className="shrink-0 text-right pr-3" style={{ width: COL_TIME, marginTop: -8 }}>
                        {isHour && (
                          <span className="dp-mono text-[10px] text-stone-400 leading-none">{fmtTime(min)}</span>
                        )}
                      </div>
                      <div className="flex-1" style={{ borderTop: isHour ? '1px solid #D4CFC2' : '1px dashed #E6DFD0' }} />
                    </div>
                  )
                })}

                {/* Click-to-create zone (right of time col) */}
                <div
                  className="absolute"
                  style={{ left: COL_TIME, right: 0, top: 0, bottom: 0, cursor: 'crosshair' }}
                  onClick={handleTimelineClick}
                />

                {/* Blocks */}
                {blocks.map(block => {
                  const top    = minToPx(block.start_min)
                  const height = minToPx(block.end_min) - top
                  const hasPrj = !!block.project_id
                  const sep    = hasPrj ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E0D9C8'

                  return (
                    <div
                      key={block.tempId}
                      className="absolute overflow-hidden flex flex-col"
                      style={{
                        left: COL_TIME,
                        right: 0,
                        top,
                        height,
                        background: hasPrj ? '#1F1B16' : '#FAF6EE',
                        border: hasPrj ? '1px solid rgba(255,255,255,0.06)' : '1.5px dashed #C4BBAD',
                        color: hasPrj ? '#FAF6EE' : '#574F44',
                        zIndex: 10,
                        boxShadow: hasPrj ? '0 2px 12px rgba(31,27,22,0.25)' : 'none',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Content row — 4 aligned columns */}
                      <div
                        className="flex-1 overflow-hidden"
                        style={{ display: 'grid', gridTemplateColumns: `1fr ${COL_PHASE}px ${COL_PRIORITY}px ${COL_DEL}px` }}
                      >
                        {/* ── Project ── */}
                        <div className="flex items-center gap-1.5 px-2 overflow-hidden" style={{ borderRight: sep }}>
                          <select
                            value={block.project_id ?? ''}
                            onChange={e => updateBlock(block.tempId, {
                              project_id: e.target.value || null,
                              phase:    e.target.value ? block.phase    : null,
                              priority: e.target.value ? block.priority : null,
                            })}
                            className="min-w-0 flex-1 text-xs font-medium focus:outline-none bg-transparent"
                            style={{ color: hasPrj ? '#FAF6EE' : '#574F44', border: 'none' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="">— project —</option>
                            {myProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <button
                            onClick={() => deleteBlock(block.tempId)}
                            className="shrink-0 w-4 h-4 rounded-full text-[10px] leading-none flex items-center justify-center transition hover:opacity-80"
                            style={{ background: hasPrj ? 'rgba(255,255,255,0.15)' : '#E6DFD0', color: hasPrj ? '#FAF6EE' : '#574F44' }}
                          >×</button>
                        </div>

                        {/* ── Phase ── */}
                        <div className="flex items-center px-2 overflow-hidden" style={{ borderRight: sep }}>
                          <select
                            value={block.phase ?? ''}
                            onChange={e => updateBlock(block.tempId, { phase: e.target.value || null })}
                            disabled={!hasPrj}
                            className="w-full text-[11px] focus:outline-none bg-transparent disabled:opacity-30"
                            style={{ color: hasPrj ? 'rgba(250,246,238,0.85)' : '#9C9384', border: 'none' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="">— phase —</option>
                            {DAILY_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
                          </select>
                        </div>

                        {/* ── Priority ── */}
                        <div className="flex items-center gap-1 px-3" style={{ borderRight: sep }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              type="button"
                              disabled={!hasPrj}
                              onClick={e => { e.stopPropagation(); updateBlock(block.tempId, { priority: block.priority === n ? null : n }) }}
                              className="flex-1 rounded-sm transition disabled:opacity-20"
                              style={{
                                height: 14,
                                background: (block.priority ?? 0) >= n ? PRIORITY_COLORS[n] : hasPrj ? 'rgba(255,255,255,0.18)' : '#E0D9C8',
                                cursor: hasPrj ? 'pointer' : 'not-allowed',
                              }}
                              title={`Priority ${n}`}
                            />
                          ))}
                        </div>

                        {/* ── Deliverable ── */}
                        <div className="flex items-center justify-center px-2">
                          <button
                            onClick={e => { e.stopPropagation(); updateBlock(block.tempId, { deliverable: !block.deliverable }) }}
                            disabled={!hasPrj}
                            className="dp-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition disabled:opacity-30 whitespace-nowrap"
                            style={{
                              background:  block.deliverable ? '#C85C3C'                : hasPrj ? 'rgba(255,255,255,0.1)' : '#F0EBE0',
                              color:       block.deliverable ? '#fff'                   : hasPrj ? 'rgba(250,246,238,0.45)' : '#9C9384',
                              border: '1px solid ' + (block.deliverable ? '#C85C3C80'  : hasPrj ? 'rgba(255,255,255,0.08)' : '#D4CFC2'),
                            }}
                          >
                            {block.deliverable ? '✓ Yes' : 'No'}
                          </button>
                        </div>
                      </div>

                      {/* Resize handle */}
                      <div
                        className="resize-handle shrink-0 flex items-center justify-center"
                        style={{
                          height: 10,
                          cursor: 'ns-resize',
                          background: hasPrj ? 'rgba(255,255,255,0.04)' : 'rgba(196,187,173,0.15)',
                          borderTop: hasPrj ? '1px solid rgba(255,255,255,0.07)' : '1px solid #E0D9C8',
                          opacity: 0.8,
                        }}
                        onMouseDown={e => handleResizeStart(e, block.tempId)}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="w-10 rounded-full" style={{ height: 2, background: hasPrj ? 'rgba(255,255,255,0.35)' : '#C4BBAD' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* ── 03: Workload summary ── */}
        <Section num="03" title="Your workload">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="p-5 rounded-xl border" style={{ background: workloadColors.bg, borderColor: workloadColors.color + '33' }}>
              <div className="dp-mono text-[10px] uppercase tracking-wider mb-1" style={{ color: workloadColors.color }}>Workload today</div>
              <div className="dp-serif text-4xl font-light" style={{ color: workloadColors.color }}>{workloadLabel}</div>
              <div className="dp-mono text-xs mt-1" style={{ color: workloadColors.color }}>
                {billingHours}h of {WORK_HOURS}h planned
              </div>
            </div>
            <StatTile label="Free hours" value={freeHours} />
            <StatTile label="Deliverables" value={blocks.filter(b => b.deliverable).length} />
          </div>

          {/* Day shape — 18 half-hour segments */}
          <div className="mt-4 flex gap-0.5">
            {daySegments.map((filled, i) => {
              const min   = WORK_START_MIN + i * SLOT_MIN
              const isNow = currentHour * 60 + new Date().getMinutes() >= min &&
                            currentHour * 60 + new Date().getMinutes() < min + SLOT_MIN
              return (
                <div
                  key={i}
                  title={`${fmtTime(min)}${filled ? '' : ' — free'}`}
                  className="flex-1 h-5 rounded-sm"
                  style={{
                    background: filled ? '#1F1B16' : '#E6DFD0',
                    outline: isNow ? '2px solid #C85C3C' : 'none',
                    outlineOffset: '1px',
                  }}
                />
              )
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="dp-mono text-[9px] text-stone-400">11am</span>
            <span className="dp-mono text-[9px] text-stone-400">8pm</span>
          </div>
        </Section>

        {/* ── 04: Past week ── */}
        <Section num="04" title="Past week">
          <button
            onClick={() => setHistOpen(o => !o)}
            className="text-sm text-stone-500 hover:text-stone-900 dp-mono uppercase tracking-wider underline underline-offset-2 mb-4 transition"
          >
            {histOpen ? '▲ hide' : '▼ show'} your last 7 days
          </button>

          {histOpen && (
            <div className="space-y-3">
              {weekLogs.length === 0 ? (
                <p className="text-sm text-stone-400 italic">No logs yet this week.</p>
              ) : weekLogs.map(log => {
                const logBlocks = (slotsByLogId[log.id] ?? []).filter(s => s.project_id)
                const hrs = logBlocks.reduce((sum, s) => sum + (s.end_min - s.start_min) / 60, 0)
                const statusMeta = STATUS_META[log.status as keyof typeof STATUS_META]
                return (
                  <div key={log.id} className="rounded-xl border border-stone-200 p-4" style={{ background: '#FAF6EE' }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-sm">{fmtDate(log.log_date)}</span>
                      <span className="px-2 py-0.5 rounded dp-mono text-[10px] uppercase tracking-wider"
                        style={{ background: statusMeta?.bg ?? '#E6E0D2', color: statusMeta?.color ?? '#574F44' }}>
                        {log.status}
                      </span>
                      <span className="dp-mono text-xs text-stone-500">{hrs}h planned</span>
                    </div>
                    {logBlocks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {logBlocks.map((s, idx) => (
                          <span key={idx} className="text-xs px-2 py-0.5 rounded-full border border-stone-200 text-stone-700" style={{ background: '#F4EFE6' }}>
                            {fmtTime(s.start_min)}–{fmtTime(s.end_min)}
                            {s.project?.name && <span className="ml-1 font-medium">{s.project.name}</span>}
                            {s.phase && <span className="text-stone-400"> · {s.phase}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
        )}
      </main>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-stone-300/60 backdrop-blur-sm z-50"
        style={{ background: 'rgba(250,246,238,0.95)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="text-xs text-stone-600 flex items-center gap-3">
            <span className="px-2.5 py-0.5 rounded-full dp-mono text-[10px] uppercase tracking-wider"
              style={{ background: workloadColors.bg, color: workloadColors.color }}>
              {workloadLabel}
            </span>
            <span>{billingHours}h planned · {freeHours}h free</span>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 hover:opacity-90 transition disabled:opacity-60"
            style={{ background: '#1F1B16', color: '#FAF6EE' }}
          >
            {isPending ? 'Saving…' : saved ? '✓ Update plan' : 'Save plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline gap-3 mb-4 pb-2 border-b border-stone-300/60">
        <span className="dp-mono text-[11px] text-stone-400 tracking-wider">{num}</span>
        <h2 className="dp-serif text-xl font-medium">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-5 rounded-xl border border-stone-200" style={{ background: '#FAF6EE' }}>
      <div className="dp-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1">{label}</div>
      <div className="dp-serif text-4xl font-light">{value}</div>
    </div>
  )
}
