'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createEmployee(data: {
  name: string
  email: string
  role: string
  designation: string
  team: string
  reports_to: string | null
  capacity_hours: number
}) {
  const admin = createAdminClient()

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: 'Invalid email address.' }
  }

  // Generate a cryptographically secure temporary password
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const tempPassword = Array.from(bytes, b => chars[b % chars.length]).join('').slice(0, 10) + 'A1!'

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: data.name, role: data.role },
  })

  if (authError) return { error: authError.message }

  // Upsert the profile row — handles both cases:
  // (a) trigger already created the row → updates it
  // (b) trigger silently failed → inserts it fresh
  const { error: profileError } = await admin
    .from('users')
    .upsert({
      id:             authData.user.id,
      email:          data.email,
      name:           data.name,
      role:           data.role,
      designation:    data.designation,
      capacity_hours: data.capacity_hours,
      team:           data.team || '',
      reports_to:     data.reports_to || null,
    }, { onConflict: 'id' })

  if (profileError) return { error: profileError.message }

  revalidatePath('/employees')
  revalidatePath('/team')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true, tempPassword }
}

export async function updateEmployee(userId: string, data: {
  name: string
  role: string
  designation: string
  team: string
  reports_to: string | null
  capacity_hours: number
}) {
  const supabase = await createClient()

  // Validate reports_to user exists if provided
  if (data.reports_to) {
    const { data: manager } = await supabase
      .from('users')
      .select('id')
      .eq('id', data.reports_to)
      .single()
    if (!manager) return { error: 'Selected manager does not exist.' }
  }

  const { error } = await supabase
    .from('users')
    .update({
      name:           data.name,
      role:           data.role,
      designation:    data.designation,
      capacity_hours: data.capacity_hours,
    })
    .eq('id', userId)

  if (error) return { error: error.message }

  // Update optional columns (team / reports_to) — only exist after migration
  await supabase
    .from('users')
    .update({
      ...(data.team !== undefined ? { team: data.team }                       : {}),
      ...(data.reports_to !== undefined ? { reports_to: data.reports_to || null } : {}),
    })
    .eq('id', userId)
  revalidatePath('/employees')
  revalidatePath('/team')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function removeEmployee(userId: string) {
  const admin = createAdminClient()

  // Clean up all related records before deleting the auth user
  await admin.from('assignments').delete().eq('user_id', userId)
  await admin.from('weekly_hours').delete().eq('user_id', userId)
  await admin.from('stage_history').delete().eq('changed_by', userId)
  // Clear reports_to references so other users don't point to a deleted user
  await admin.from('users').update({ reports_to: null }).eq('reports_to', userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  revalidatePath('/employees')
  revalidatePath('/team')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}
