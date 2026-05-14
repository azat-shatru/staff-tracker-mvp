// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'

const STAGE_ORDER = [
  'kickoff', 'questionnaire', 'programming',
  'fielding', 'templating', 'analysis', 'reporting',
] as const

type StageName = typeof STAGE_ORDER[number]

type StageRow = {
  id: string
  project_id: string
  stage: string
  status: string
  manually_set_at: string | null
}

type StageUpdate = {
  status: string
  started_at: string | null
  completed_at: string | null
}

/**
 * Runs automatic stage assignment for all active/on_hold projects:
 *
 * 1. Finds the most recent weekly_hours entry (by week_start) per project that
 *    has a stage value — that stage becomes the "active" stage.
 * 2. If the last entry is > 4 weeks old, the project is auto-completed.
 * 3. Otherwise cascades:
 *      before active stage → status = 'complete'
 *      active stage        → status = 'in_progress'
 *      after active stage  → status = 'pending'
 * 4. Stages with manually_set_at IS NOT NULL are left untouched.
 *
 * Uses the admin client so RLS is bypassed — call only from server-side cron.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAutoStage(supabase: SupabaseClient<any>) {
  const now = new Date().toISOString()
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().slice(0, 10)

  // Fetch all log entries that have a stage value, ordered newest first
  const { data: logs, error: logsErr } = await supabase
    .from('weekly_hours')
    .select('project_id, week_start, stage')
    .not('project_id', 'is', null)
    .not('stage', 'is', null)
    .order('week_start', { ascending: false })

  if (logsErr) return { ok: false, error: logsErr.message }

  // Build per-project: most recent { stage, week_start }
  const byProject: Record<string, { stage: string; week_start: string }> = {}
  for (const row of (logs ?? []) as { project_id: string; week_start: string; stage: string }[]) {
    if (!byProject[row.project_id]) {
      byProject[row.project_id] = { stage: row.stage, week_start: row.week_start }
    }
  }

  const projectIds = Object.keys(byProject)
  if (!projectIds.length) return { ok: true, updated: 0 }

  // Fetch active/on_hold projects and their stages in one round-trip
  const [{ data: activeProjects }, { data: allStages }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, status')
      .in('id', projectIds)
      .in('status', ['active', 'on_hold']),
    supabase
      .from('project_stages')
      .select('id, project_id, stage, status, manually_set_at')
      .in('project_id', projectIds),
  ])

  // Group stages by project
  const stagesByProject: Record<string, StageRow[]> = {}
  for (const s of (allStages ?? []) as StageRow[]) {
    if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = []
    stagesByProject[s.project_id].push(s)
  }

  let updated = 0

  for (const project of (activeProjects ?? []) as { id: string; status: string }[]) {
    const log = byProject[project.id]
    if (!log) continue

    // ── Auto-complete stale projects ─────────────────────────────────────────
    if (log.week_start < fourWeeksAgoStr) {
      if (project.status === 'active') {
        await supabase.from('projects').update({ status: 'complete' }).eq('id', project.id)
        updated++
      }
      continue
    }

    // ── Cascade stage statuses ───────────────────────────────────────────────
    const activeIdx = STAGE_ORDER.indexOf(log.stage as StageName)
    if (activeIdx === -1) continue

    const stages = stagesByProject[project.id] ?? []

    for (const stageRow of stages) {
      if (stageRow.manually_set_at) continue   // manual override — leave it alone

      const stageIdx = STAGE_ORDER.indexOf(stageRow.stage as StageName)
      if (stageIdx === -1) continue

      let targetStatus: string
      let upd: StageUpdate

      if (stageIdx < activeIdx) {
        if (stageRow.status === 'complete') continue
        targetStatus = 'complete'
        upd = { status: targetStatus, started_at: now, completed_at: now }
      } else if (stageIdx === activeIdx) {
        if (stageRow.status === 'in_progress') continue
        targetStatus = 'in_progress'
        upd = { status: targetStatus, started_at: now, completed_at: null }
      } else {
        if (stageRow.status === 'pending') continue
        targetStatus = 'pending'
        upd = { status: targetStatus, started_at: null, completed_at: null }
      }

      await supabase.from('project_stages').update(upd).eq('id', stageRow.id)
      updated++
    }
  }

  return { ok: true, updated }
}
