'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type SlotPayload = {
  start_min:   number
  end_min:     number
  project_id:  string | null
  phase:       string | null
  priority:    number | null
  deliverable: boolean
}

/** Upsert the current user's daily log header, then replace all slot blocks. */
export async function saveDailyLog(
  status:  'WFO' | 'WFH',
  slots:   SlotPayload[],
  logDate: string,   // 'YYYY-MM-DD'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Upsert the header
  const { data: log, error: logErr } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: user.id, log_date: logDate, status, submitted_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
    .select('id')
    .single()

  if (logErr || !log) return { error: logErr?.message ?? 'Failed to save log' }

  // Replace all slots: delete existing, then insert fresh
  const { error: delErr } = await supabase
    .from('daily_log_slots')
    .delete()
    .eq('log_id', log.id)

  if (delErr) return { error: delErr.message }

  if (slots.length > 0) {
    const slotRows = slots.map(s => ({
      log_id:      log.id,
      start_min:   s.start_min,
      end_min:     s.end_min,
      project_id:  s.project_id,
      phase:       s.phase,
      priority:    s.priority,
      deliverable: s.deliverable,
    }))
    const { error: insertErr } = await supabase
      .from('daily_log_slots')
      .insert(slotRows)
    if (insertErr) return { error: insertErr.message }
  }

  revalidatePath('/daily-log')
  revalidatePath('/team-status')
  revalidatePath('/log-hours')
  return { success: true, logId: log.id }
}

/** Mark any user as OOO for a given date. Records who set it. */
export async function markUserOOO(targetUserId: string, logDate: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      {
        user_id:      targetUserId,
        log_date:     logDate,
        status:       'OOO',
        ooo_set_by:   user.id,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,log_date' }
    )

  if (error) return { error: error.message }
  revalidatePath('/daily-log')
  revalidatePath('/team-status')
  return { success: true }
}

/** Unmark OOO for a user (revert to WFO). */
export async function clearOOO(targetUserId: string, logDate: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: targetUserId, log_date: logDate, status: 'WFO', ooo_set_by: null },
      { onConflict: 'user_id,log_date' }
    )

  if (error) return { error: error.message }
  revalidatePath('/daily-log')
  revalidatePath('/team-status')
  return { success: true }
}
