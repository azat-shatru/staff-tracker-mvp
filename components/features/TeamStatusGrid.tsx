'use client'

import { useTransition } from 'react'
import { markUserOOO, clearOOO } from '@/app/daily-log/actions'

type Member = {
  id: string
  name: string
  role: string
  status: string
  submitted: string | null
  committedHrs: number
  availableHrs: number
  projectsToday: { id: string; name: string; phase: string | null }[]
}

interface Props {
  members: Member[]
  today: string
  currentUserId: string
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function timeAgo(iso: string | null) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

const STATUS_META: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  WFO:        { label: 'In office',      bg: '#E6E0D2', color: '#1F1B16', dot: '#574F44' },
  WFH:        { label: 'From home',      bg: '#DDE5D5', color: '#4E6843', dot: '#5E9447' },
  OOO:        { label: 'Out of office',  bg: '#F2DBD0', color: '#B85333', dot: '#C23925' },
  not_logged: { label: 'Not logged yet', bg: '#F0EBE0', color: '#9C9384', dot: '#C4BBAD' },
}

const WORKLOADS = {
  light: { label: 'Light', color: '#3F7233', bg: '#D7E8CC', dot: '#5E9447' },
  busy:  { label: 'Busy',  color: '#9A6B14', bg: '#F2E2BD', dot: '#C99524' },
  heavy: { label: 'Heavy', color: '#9B2C25', bg: '#F2C9C0', dot: '#C23925' },
}

function workloadFor(hrs: number) {
  if (hrs <= 3) return WORKLOADS.light
  if (hrs <= 6) return WORKLOADS.busy
  return WORKLOADS.heavy
}

export default function TeamStatusGrid({ members, today, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()

  const handleOOO = (memberId: string, isOOO: boolean) => {
    startTransition(async () => {
      if (isOOO) await clearOOO(memberId, today)
      else       await markUserOOO(memberId, today)
    })
  }

  const logged = members.filter(m => m.submitted).length
  const ooo    = members.filter(m => m.status === 'OOO').length
  const wfo    = members.filter(m => m.status === 'WFO').length
  const wfh    = members.filter(m => m.status === 'WFH').length

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: '#F4EFE6',
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
        color: '#1F1B16',
      }}
    >
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .dp-serif { font-family: 'Fraunces', ui-serif, Georgia, serif; }
        .dp-mono  { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .dp-card  { box-shadow: 0 1px 0 rgba(31,27,22,0.06), 0 8px 24px -12px rgba(31,27,22,0.12); }
        @keyframes pulse-soft { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        .pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <header className="w-full border-b border-stone-300/60" style={{ background: '#FAF6EE' }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="dp-serif text-2xl" style={{ color: '#1F1B16' }}>Team Status</span>
            <span className="dp-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              // {fmtDate(today)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/daily-log"
              className="text-sm flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-300 hover:border-stone-500 transition"
              style={{ color: '#574F44' }}
            >
              My daily log →
            </a>
            <a
              href="/dashboard"
              className="text-sm flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-300 hover:border-stone-500 transition"
              style={{ color: '#574F44' }}
            >
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 sm:px-10 pb-16 pt-10">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          <StatTile label="Logged in"    value={`${logged} / ${members.length}`} />
          <StatTile label="In office"    value={wfo}  color="#1F1B16"  bg="#E6E0D2" />
          <StatTile label="From home"    value={wfh}  color="#4E6843"  bg="#DDE5D5" />
          <StatTile label="Out of office" value={ooo} color="#B85333"  bg="#F2DBD0" />
        </div>

        {/* Section header */}
        <div className="flex items-baseline gap-4 mb-5 pb-3 border-b border-stone-300/70">
          <span className="dp-mono text-[11px] text-stone-400 tracking-wider">·</span>
          <h2 className="dp-serif text-2xl" style={{ fontWeight: 500 }}>At a glance</h2>
          <span className="dp-mono text-[10px] uppercase tracking-wider text-stone-500 ml-auto">
            Name · Status · Workload · Projects today · Available
          </span>
        </div>

        {/* Table */}
        <div
          className="rounded-xl border border-stone-300/70 overflow-hidden overflow-x-auto dp-card"
          style={{ background: '#FAF6EE' }}
        >
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-stone-300/70" style={{ background: '#F0EBE0' }}>
                <th className="text-left px-5 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 180 }}>
                  Name
                </th>
                <th className="text-left px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 120 }}>
                  Role
                </th>
                <th className="text-left px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 140 }}>
                  Status
                </th>
                <th className="text-center px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 110 }}>
                  Workload
                </th>
                <th className="text-center px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 100 }}>
                  Committed
                </th>
                <th className="text-center px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 100 }}>
                  Available
                </th>
                <th className="text-left px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal">
                  Projects &amp; phase today
                </th>
                <th className="text-left px-4 py-3 dp-mono text-[10px] uppercase tracking-wider text-stone-500 font-normal" style={{ minWidth: 110 }}>
                  Updated
                </th>
                <th className="px-4 py-3" style={{ minWidth: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => {
                const isMe    = m.id === currentUserId
                const isOOO   = m.status === 'OOO'
                const meta    = STATUS_META[m.status] ?? STATUS_META.not_logged
                const wl      = isOOO ? null : workloadFor(m.committedHrs)
                const isLast  = idx === members.length - 1

                return (
                  <tr
                    key={m.id}
                    className={isLast ? '' : 'border-b border-stone-300/40'}
                    style={{ background: idx % 2 === 0 ? '#FAF6EE' : 'rgba(244,239,230,0.5)' }}
                  >
                    {/* Name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="dp-serif text-base" style={{ color: '#1F1B16' }}>{m.name}</span>
                        {isMe && (
                          <span
                            className="dp-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: '#E6E0D2', color: '#574F44' }}
                          >
                            you
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3.5">
                      <span className="dp-mono text-[10px] uppercase tracking-wider text-stone-500">{m.role}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full dp-mono text-[10px] uppercase tracking-wider whitespace-nowrap"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
                        {meta.label}
                      </span>
                    </td>

                    {/* Workload */}
                    <td className="px-4 py-3.5 text-center">
                      {wl ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded dp-mono text-[10px] uppercase tracking-wider"
                          style={{ background: wl.bg, color: wl.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: wl.dot }} />
                          {wl.label}
                        </span>
                      ) : (
                        <span className="text-stone-300 dp-mono text-[10px]">—</span>
                      )}
                    </td>

                    {/* Committed hours */}
                    <td className="px-4 py-3.5 text-center">
                      {isOOO ? (
                        <span className="text-stone-300 dp-mono text-[10px]">—</span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className="dp-serif text-xl" style={{ fontWeight: 500, color: '#1F1B16' }}>
                            {m.committedHrs}
                            <span className="dp-mono text-[10px] ml-0.5 text-stone-500">h</span>
                          </span>
                          {/* Mini occupancy bar */}
                          <div className="flex gap-0.5">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-2 h-1.5 rounded-sm"
                                style={{ background: i < m.committedHrs ? '#1F1B16' : '#E6DFD0' }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Available hours */}
                    <td className="px-4 py-3.5 text-center">
                      {isOOO ? (
                        <span className="text-stone-300 dp-mono text-[10px]">—</span>
                      ) : (
                        <span
                          className="dp-serif text-xl"
                          style={{ fontWeight: 500, color: m.availableHrs > 0 ? '#3F7233' : '#9C9384' }}
                        >
                          {m.availableHrs}
                          <span className="dp-mono text-[10px] ml-0.5 text-stone-500">h</span>
                        </span>
                      )}
                    </td>

                    {/* Projects today */}
                    <td className="px-4 py-3.5">
                      {isOOO ? (
                        <span className="dp-mono text-[10px] uppercase tracking-wider" style={{ color: '#B85333' }}>
                          away today
                        </span>
                      ) : m.projectsToday.length === 0 ? (
                        <span className="dp-mono text-[10px] text-stone-400 italic">
                          {m.submitted ? 'nothing planned' : 'awaiting log'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {m.projectsToday.map(p => (
                            <div
                              key={p.id}
                              className="px-2 py-1 rounded-md text-xs leading-tight max-w-[180px]"
                              style={{ background: '#1F1B16', color: '#FAF6EE' }}
                              title={p.name + (p.phase ? ` · ${p.phase}` : '')}
                            >
                              <span className="dp-serif text-[12px] truncate block">{p.name}</span>
                              {p.phase && (
                                <span className="dp-mono text-[9px] uppercase tracking-wider text-stone-400 block">
                                  {p.phase}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3.5">
                      <span className="dp-mono text-[10px] text-stone-400">
                        {m.submitted ? timeAgo(m.submitted) : '—'}
                      </span>
                    </td>

                    {/* OOO action */}
                    <td className="px-4 py-3.5 text-right">
                      {!isMe && (
                        <button
                          onClick={() => handleOOO(m.id, isOOO)}
                          disabled={isPending}
                          className="dp-mono text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border transition hover:opacity-80 disabled:opacity-40 whitespace-nowrap"
                          style={isOOO
                            ? { background: '#FAF6EE', borderColor: '#D4CFC2', color: '#574F44' }
                            : { background: '#F2DBD0', borderColor: '#D27A5060', color: '#B85333' }
                          }
                        >
                          {isOOO ? '✕ clear OOO' : 'mark OOO'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

function StatTile({
  label, value, color, bg,
}: {
  label: string
  value: number | string
  color?: string
  bg?: string
}) {
  return (
    <div
      className="p-5 rounded-xl border border-stone-300/70 dp-card"
      style={{ background: bg ?? '#FAF6EE' }}
    >
      <div className="dp-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1">{label}</div>
      <div className="dp-serif text-4xl" style={{ fontWeight: 500, color: color ?? '#1F1B16' }}>
        {value}
      </div>
    </div>
  )
}
