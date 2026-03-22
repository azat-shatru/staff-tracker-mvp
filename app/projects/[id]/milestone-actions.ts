'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleMilestone(
  stageId: string,
  milestoneKey: string,
  currentValue: string,
  projectId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const newValue = currentValue === 'complete' ? 'pending' : 'complete'
  const noteKey = `ms_${milestoneKey}`

  await supabase
    .from('stage_notes')
    .upsert(
      { stage_id: stageId, field_key: noteKey, value: newValue },
      { onConflict: 'stage_id,field_key' }
    )

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}
