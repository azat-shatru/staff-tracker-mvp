'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { DeliverableStatus } from '@/lib/types'

const ALLOWED_ROLES = ['manager', 'consultant']

async function requireCanManageDeliverables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  if (!data || !ALLOWED_ROLES.includes(data.role)) return { error: 'Permission denied' }
  return null
}

export async function addDeliverable(formData: FormData, stageId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireCanManageDeliverables(supabase, user.id)
  if (permError) return permError

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const expected_date = formData.get('expected_date') as string
  const expected_time = formData.get('expected_time') as string

  let expected_at: string | null = null
  if (expected_date) {
    const dt = new Date(`${expected_date}T${expected_time || '17:00'}`)
    if (isNaN(dt.getTime())) return { error: 'Invalid expected date.' }
    expected_at = dt.toISOString()
  }

  const { error } = await supabase.from('deliverables').insert({
    stage_id: stageId,
    name,
    type,
    expected_at,
    status: 'pending',
  })

  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

export async function approveQC(deliverableId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireCanManageDeliverables(supabase, user.id)
  if (permError) return permError

  const { error } = await supabase
    .from('deliverables')
    .update({ qc_approved_by: user.id, status: 'qc_required' })
    .eq('id', deliverableId)

  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

export async function markDeliverable(
  deliverableId: string,
  newStatus: DeliverableStatus,
  projectId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireCanManageDeliverables(supabase, user.id)
  if (permError) return permError

  // QC gateway — block sent/complete without qc_approved_by
  if (newStatus === 'sent' || newStatus === 'complete') {
    const { data: deliverable } = await supabase
      .from('deliverables')
      .select('qc_approved_by')
      .eq('id', deliverableId)
      .single()

    if (!deliverable?.qc_approved_by) {
      return { error: 'QC approval is required before marking as Sent or Complete.' }
    }
  }

  const { error } = await supabase
    .from('deliverables')
    .update({
      status: newStatus,
      delivered_at: newStatus === 'sent' || newStatus === 'complete'
        ? new Date().toISOString()
        : null,
    })
    .eq('id', deliverableId)

  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}
