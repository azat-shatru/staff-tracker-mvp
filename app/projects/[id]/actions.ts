'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { StageStatus } from '@/lib/types'

// All interlocks are soft — returns a warning the user can choose to override
async function checkInterlocks(
  stageName: string,
  projectId: string,
  force: boolean
): Promise<{ warning?: string } | null> {
  if (force) return null

  const supabase = await createClient()

  const { data: stages } = await supabase
    .from('project_stages')
    .select('id, stage, status')
    .eq('project_id', projectId)

  if (!stages) return null

  const byStage = Object.fromEntries(stages.map(s => [s.stage, s]))

  async function getNote(stage: string, key: string): Promise<string | null> {
    const s = byStage[stage]
    if (!s) return null
    const { data } = await supabase
      .from('stage_notes')
      .select('value')
      .eq('stage_id', s.id)
      .eq('field_key', key)
      .single()
    return data?.value ?? null
  }

  const isActive = (stage: string) =>
    ['in_progress', 'complete'].includes(byStage[stage]?.status ?? '')
  const isComplete = (stage: string) => byStage[stage]?.status === 'complete'

  switch (stageName) {
    case 'questionnaire': {
      const koDeck = await getNote('kickoff', 'ko_deck_url')
      if (!koDeck) {
        return { warning: 'The KO deck has not been uploaded in the Kickoff stage. Do you want to proceed anyway?' }
      }
      break
    }

    case 'programming': {
      const qnrVersion = await getNote('questionnaire', 'version')
      if (!qnrVersion) {
        return { warning: 'No Questionnaire draft version has been recorded yet. Do you want to proceed anyway?' }
      }
      break
    }

    case 'fielding': {
      if (!isActive('programming')) {
        return { warning: 'Programming has not started yet. Do you want to proceed anyway?' }
      }
      break
    }

    case 'templating': {
      const qnrVersion = await getNote('questionnaire', 'version')
      if (!qnrVersion) {
        return { warning: 'No Questionnaire draft version has been recorded yet. Do you want to proceed anyway?' }
      }
      break
    }

    case 'analysis': {
      if (!isActive('fielding')) {
        return { warning: 'Fielding has not started yet. Do you want to proceed anyway?' }
      }
      break
    }

    case 'reporting': {
      const warnings: string[] = []
      if (!isComplete('templating')) warnings.push('Templating is not complete')
      if (!isActive('fielding')) warnings.push('Fielding has not started')
      if (warnings.length > 0) {
        return { warning: `${warnings.join(' and ')}. Do you want to proceed anyway?` }
      }
      break
    }
  }

  return null
}

export async function updateStageStatus(
  stageId: string,
  newStatus: StageStatus,
  projectId: string,
  stageName: string,
  force = false
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Run interlock checks only when starting a stage
  if (newStatus === 'in_progress') {
    const interlock = await checkInterlocks(stageName, projectId, force)
    if (interlock?.warning) return { warning: interlock.warning }
  }

  // Get current status for history
  const { data: current } = await supabase
    .from('project_stages')
    .select('status')
    .eq('id', stageId)
    .single()

  await supabase
    .from('project_stages')
    .update({
      status: newStatus,
      started_at: newStatus === 'in_progress' ? new Date().toISOString() : undefined,
      completed_at: newStatus === 'complete' ? new Date().toISOString() : undefined,
    })
    .eq('id', stageId)

  await supabase.from('stage_history').insert({
    stage_id: stageId,
    from_status: current?.status ?? null,
    to_status: newStatus,
    changed_by: user.id,
    ...(force ? { notes: 'Interlock bypassed (force)' } : {}),
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/staffing')
  revalidatePath('/team')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function removeStage(stageId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Reset stage back to pending and clear timestamps
  await supabase
    .from('project_stages')
    .update({ status: 'pending', started_at: null, completed_at: null })
    .eq('id', stageId)

  // Clear all notes and deliverables for this stage
  await supabase.from('stage_notes').delete().eq('stage_id', stageId)
  await supabase.from('deliverables').delete().eq('stage_id', stageId)

  // Log the reset to history
  await supabase.from('stage_history').insert({
    stage_id: stageId,
    from_status: null,
    to_status: 'pending',
    changed_by: user.id,
    notes: 'Stage removed and reset to pending',
  })

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

export async function updateTimeline(
  projectId: string,
  stageDates: Record<string, string>,
  stageHours?: Record<string, number>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: stages } = await supabase
    .from('project_stages')
    .select('id, stage')
    .eq('project_id', projectId)

  if (!stages?.length) return { error: 'No stages found' }

  for (const stageRow of stages) {
    const date = stageDates[stageRow.stage]
    if (date) {
      await supabase.from('stage_notes').upsert(
        { stage_id: stageRow.id, field_key: 'planned_delivery_date', value: date },
        { onConflict: 'stage_id,field_key' }
      )
    }
    const hours = stageHours?.[stageRow.stage]
    if (hours !== undefined) {
      await supabase.from('stage_notes').upsert(
        { stage_id: stageRow.id, field_key: 'expected_hours_per_week', value: String(hours) },
        { onConflict: 'stage_id,field_key' }
      )
    }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/staffing')
  revalidatePath('/team')
  return { success: true }
}

export async function saveStageNotes(
  stageId: string,
  notes: Record<string, string>,
  projectId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const entries = Object.entries(notes).filter(([, v]) => v.trim() !== '')

  for (const [field_key, value] of entries) {
    await supabase
      .from('stage_notes')
      .upsert({ stage_id: stageId, field_key, value }, { onConflict: 'stage_id,field_key' })
  }

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}
