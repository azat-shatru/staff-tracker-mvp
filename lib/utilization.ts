// ─── Stage ordering & labels ───────────────────────────────────────────────
export const STAGE_ORDER = [
  'kickoff', 'questionnaire', 'programming',
  'fielding', 'templating', 'analysis', 'reporting',
] as const

export const STAGE_LABELS: Record<string, string> = {
  kickoff: 'Kickoff', questionnaire: 'Questionnaire', programming: 'Programming',
  fielding: 'Fielding', templating: 'Templating', analysis: 'Analysis', reporting: 'Reporting',
}

// Default duration (weeks) per stage — total = 13 weeks
export const STAGE_WEEKS: Record<string, number> = {
  kickoff: 1, questionnaire: 2, programming: 1,
  fielding: 4, templating: 1, analysis: 2, reporting: 2,
}
export const TOTAL_DEFAULT_WEEKS = Object.values(STAGE_WEEKS).reduce((a, b) => a + b, 0) // 13

// Default total project hours/week demanded per stage.
// Each team member's share = STAGE_HOURS[stage] × (their allocation_pct / 100).
// The sum of all members' allocation_pct should equal 100 so hours are fully distributed.
export const STAGE_HOURS: Record<string, number> = {
  kickoff:       1,
  questionnaire: 8,
  programming:   4,
  fielding:      2,
  templating:    3,
  analysis:      4,
  reporting:     10,
}

export const CAPACITY_PER_WEEK = 40  // standard 40 h/week = 100 % utilization

// ─── Shared types ───────────────────────────────────────────────────────────
export type StageTimelineItem = {
  stage: string
  label: string
  status: 'pending' | 'in_progress' | 'blocked' | 'complete'
  estimatedStart: string   // YYYY-MM-DD
  estimatedEnd: string     // YYYY-MM-DD
  predictedHoursPerWeek: number
}

export type ProjectBreakdown = {
  projectId: string
  projectName: string
  projectStatus: string
  allocationPct: number
  roleLabel: string
  currentStage: string | null
  currentStageStatus: string | null
  predictedHoursThisWeek: number   // based on active stage
  actualHoursPeriod: number        // from weekly_hours
  stageTimeline: StageTimelineItem[]
  projectEndDate: string | null
}

export type UserUtilizationData = {
  userId: string
  name: string
  role: string
  actualHours: number          // logged in period
  capacityHours: number        // period capacity (weekCount × 40)
  predictedHoursPerWeek: number
  projects: ProjectBreakdown[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Monday of the week containing `d` */
export function weekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(m.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m
}

/** YYYY-MM-DD string */
export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Get period start / end / week-count based on period key */
export function getPeriodBounds(period: string): { start: string; end: string; weekCount: number } {
  const today = new Date()
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const weekCount = Math.ceil(end.getDate() / 7)
    return { start: toDateStr(start), end: toDateStr(end), weekCount }
  }
  if (period === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    const end   = new Date(today.getFullYear(), 11, 31)
    return { start: toDateStr(start), end: toDateStr(end), weekCount: 52 }
  }
  // default: this week
  const start = weekStart(today)
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start: toDateStr(start), end: toDateStr(end), weekCount: 1 }
}

/**
 * Given project start/end and stages with their current status,
 * compute the estimated calendar window for every stage.
 */
export function buildStageTimeline(
  kickoffDate: string,
  endDate: string,
  stageStatuses: { stage: string; status: string }[],
  allocationPct: number,
  hoursOverrides?: Record<string, number>   // per-project expected h/week per stage
): StageTimelineItem[] {
  const start   = new Date(kickoffDate)
  const end     = new Date(endDate)
  const totalMs = end.getTime() - start.getTime()

  let cursor = start.getTime()

  return STAGE_ORDER.map(stageName => {
    const proportion = STAGE_WEEKS[stageName] / TOTAL_DEFAULT_WEEKS
    const stageMs    = totalMs * proportion
    const stageStart = new Date(cursor)
    cursor += stageMs
    const stageEnd   = new Date(cursor)

    const statusRow = stageStatuses.find(s => s.stage === stageName)
    const status    = (statusRow?.status ?? 'pending') as StageTimelineItem['status']

    // Project's total demand for this stage (use saved override or default)
    const totalProjectHours = hoursOverrides?.[stageName] ?? STAGE_HOURS[stageName] ?? 4
    // This person's share = total demand × their fraction of the team
    const predictedHoursPerWeek = +(totalProjectHours * (allocationPct / 100)).toFixed(1)

    return {
      stage: stageName,
      label: STAGE_LABELS[stageName],
      status,
      estimatedStart: toDateStr(stageStart),
      estimatedEnd:   toDateStr(stageEnd),
      predictedHoursPerWeek,
    }
  })
}
