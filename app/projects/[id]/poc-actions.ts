'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function savePoc(
  projectId: string,
  teamName: string,
  userId: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (userId) {
    await supabase
      .from('poc_registry')
      .upsert(
        { project_id: projectId, team_name: teamName, user_id: userId },
        { onConflict: 'project_id,team_name' }
      )
  } else {
    await supabase
      .from('poc_registry')
      .delete()
      .eq('project_id', projectId)
      .eq('team_name', teamName)
  }

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}
