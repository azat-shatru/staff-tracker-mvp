'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function revalidateAll(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/team')
  revalidatePath('/staffing')
}

async function requireManager(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  if (data?.role !== 'manager') return { error: 'Permission denied' }
  return null
}

export async function addAssignment(
  projectId: string,
  userId: string,
  roleLabel: string,
  allocationPct: number,
  startDate: string | null,
  endDate: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireManager(supabase, user.id)
  if (permError) return permError

  const { error } = await supabase.from('assignments').insert({
    project_id: projectId,
    user_id: userId,
    role_label: roleLabel,
    allocation_pct: allocationPct,
    start_date: startDate || null,
    end_date: endDate || null,
  })
  if (error) return { error: error.message }

  revalidateAll(projectId)
  return { success: true }
}

export async function removeAssignment(assignmentId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireManager(supabase, user.id)
  if (permError) return permError

  const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
  if (error) return { error: error.message }

  revalidateAll(projectId)
  return { success: true }
}

export async function changeProjectManager(
  projectId: string,
  newManagerId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireManager(supabase, user.id)
  if (permError) return permError

  // Get current project manager id
  const { data: project } = await supabase
    .from('projects')
    .select('project_manager_id')
    .eq('id', projectId)
    .single()

  // Remove old manager's PM assignment (keep any other role they may have)
  if (project?.project_manager_id) {
    await supabase
      .from('assignments')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', project.project_manager_id)
      .eq('role_label', 'Project Manager')
  }

  // Update the project
  const { error } = await supabase
    .from('projects')
    .update({ project_manager_id: newManagerId })
    .eq('id', projectId)
  if (error) return { error: error.message }

  // Add new manager's PM assignment (only if not already assigned to this project)
  const { data: existing } = await supabase
    .from('assignments')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', newManagerId)
    .eq('role_label', 'Project Manager')
    .maybeSingle()

  if (!existing) {
    await supabase.from('assignments').insert({
      project_id: projectId,
      user_id: newManagerId,
      role_label: 'Project Manager',
      allocation_pct: 0,
    })
  }

  revalidateAll(projectId)
  return { success: true }
}

export async function updateAssignmentAllocation(
  assignmentId: string,
  projectId: string,
  allocationPct: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const permError = await requireManager(supabase, user.id)
  if (permError) return permError

  const { error } = await supabase
    .from('assignments')
    .update({ allocation_pct: allocationPct })
    .eq('id', assignmentId)
  if (error) return { error: error.message }

  revalidateAll(projectId)
  return { success: true }
}
