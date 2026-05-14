type DayEntry = {
  log_date: string
  phase: string | null
  priority: number | null
  hours: number
}

export type ProjectGroup = {
  project_id: string
  project_name: string
  totalHours: number
  days: DayEntry[]
}

export function buildProjectGroups(
  slots: {
    log_id: string
    start_min: number
    end_min: number
    project_id: string | null
    phase: string | null
    priority: number | null
    project?: { id: string; name: string } | null
  }[],
  logs: { id: string; log_date: string }[],
): ProjectGroup[] {
  const logDateById: Record<string, string> = {}
  for (const l of logs) logDateById[l.id] = l.log_date

  type DayMap = Record<string, { hours: number; phase: string | null; priority: number | null; name: string }>
  const byProject: Record<string, DayMap> = {}

  for (const s of slots) {
    if (!s.project_id) continue
    const logDate = logDateById[s.log_id]
    if (!logDate) continue
    const hours = (s.end_min - s.start_min) / 60

    if (!byProject[s.project_id]) byProject[s.project_id] = {}
    const dm = byProject[s.project_id]
    if (!dm[logDate]) dm[logDate] = { hours: 0, phase: s.phase, priority: s.priority, name: s.project?.name ?? 'Unknown' }
    dm[logDate].hours += hours
    if (s.phase    && !dm[logDate].phase)    dm[logDate].phase    = s.phase
    if (s.priority && !dm[logDate].priority) dm[logDate].priority = s.priority
  }

  return Object.entries(byProject).map(([pid, dayMap]) => {
    const days: DayEntry[] = Object.entries(dayMap)
      .map(([log_date, d]) => ({ log_date, hours: d.hours, phase: d.phase, priority: d.priority }))
      .sort((a, b) => b.log_date.localeCompare(a.log_date))
    const totalHours = days.reduce((sum, d) => sum + d.hours, 0)
    return {
      project_id:   pid,
      project_name: Object.values(dayMap)[0].name,
      totalHours,
      days,
    }
  }).sort((a, b) => b.totalHours - a.totalHours)
}
