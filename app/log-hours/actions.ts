'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logHours(data: {
  week_start:  string
  project_id:  string | null   // null for leave entries
  hours:       number
  rating:      number
  leave_type?: string          // 'paid_leave' | 'sick_leave' | undefined
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (data.leave_type) {
    const { error } = await supabase
      .from('weekly_hours')
      .insert({
        user_id:      user.id,
        project_id:   null,
        week_start:   data.week_start,
        hours_logged: 8,
        rating:       data.rating,
        leave_type:   data.leave_type,
      })
    if (error) return { error: error.message }
  } else {
    // Check if an entry already exists for this user/project/week
    const { data: existing } = await supabase
      .from('weekly_hours')
      .select('id')
      .eq('user_id',    user.id)
      .eq('project_id', data.project_id!)
      .eq('week_start', data.week_start)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('weekly_hours')
        .update({ hours_logged: data.hours, rating: data.rating })
        .eq('id', existing.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase
        .from('weekly_hours')
        .insert({
          user_id:      user.id,
          project_id:   data.project_id,
          week_start:   data.week_start,
          hours_logged: data.hours,
          rating:       data.rating,
        })
      if (error) return { error: error.message }
    }
  }

  revalidatePath('/staffing')
  revalidatePath('/team')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteHoursEntry(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)

  const { error } = await supabase
    .from('weekly_hours')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .gte('entry_date', cutoff.toISOString())

  if (error) return { error: error.message }
  revalidatePath('/log-hours')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateHoursEntry(id: string, data: {
  week_start:  string
  project_id:  string | null
  hours:       number
  rating:      number
  leave_type?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)

  const { error } = await supabase
    .from('weekly_hours')
    .update({
      week_start:   data.week_start,
      project_id:   data.project_id,
      hours_logged: data.hours,
      rating:       data.rating,
      leave_type:   data.leave_type ?? null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .gte('entry_date', cutoff.toISOString())

  if (error) return { error: error.message }
  revalidatePath('/log-hours')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}
