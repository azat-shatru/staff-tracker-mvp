'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createProject(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = formData.get('name') as string
  const client = formData.get('client') as string
  const project_type = formData.get('project_type') as string
  const kickoff_date = formData.get('kickoff_date') as string
  const target_delivery_date = formData.get('target_delivery_date') as string
  const project_manager_id = formData.get('project_manager_id') as string

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name,
      client,
      project_type,
      kickoff_date: kickoff_date || null,
      target_delivery_date: target_delivery_date || null,
      project_manager_id: project_manager_id || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Create all 7 stages
  const stages = ['kickoff', 'questionnaire', 'programming', 'fielding', 'templating', 'analysis', 'reporting']
  await supabase.from('project_stages').insert(
    stages.map(stage => ({
      project_id: project.id,
      stage,
      status: 'pending',
    }))
  )

  // Auto-assign the project manager at 0% so they appear in the team
  // without pre-consuming the project's full hours budget.
  // The manager's actual allocation share is set alongside team members.
  if (project_manager_id) {
    await supabase.from('assignments').insert({
      project_id: project.id,
      user_id: project_manager_id,
      role_label: 'Project Manager',
      allocation_pct: 0,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath('/team')
  revalidatePath('/staffing')
  return { success: true, projectId: project.id }
}
