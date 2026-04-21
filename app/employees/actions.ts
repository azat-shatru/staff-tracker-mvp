'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertManager(): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['manager', 'director', 'executive'].includes(me?.role ?? '')) return { error: 'Only managers can perform this action.' }
  return null
}

export async function createEmployee(data: {
  name: string
  email: string
  role: string
  team: string
  reports_to: string | null
  capacity_hours: number
}) {
  const admin = createAdminClient()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: 'Invalid email address.' }
  }

  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const tempPassword = Array.from(bytes, b => chars[b % chars.length]).join('').slice(0, 10) + 'A1!'

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: data.name, role: data.role },
  })

  if (authError) return { error: authError.message }

  const { error: profileError } = await admin
    .from('users')
    .upsert({
      id:             authData.user.id,
      email:          data.email,
      name:           data.name,
      role:           data.role,
      capacity_hours: data.capacity_hours,
      team:           data.team || '',
      reports_to:     data.reports_to || null,
      active:         true,
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
  team: string
  reports_to: string | null
  capacity_hours: number
}) {
  const supabase = await createClient()

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
    .update({ name: data.name, role: data.role, capacity_hours: data.capacity_hours })
    .eq('id', userId)

  if (error) return { error: error.message }

  await supabase
    .from('users')
    .update({
      ...(data.team !== undefined ? { team: data.team } : {}),
      ...(data.reports_to !== undefined ? { reports_to: data.reports_to || null } : {}),
    })
    .eq('id', userId)

  revalidatePath('/employees')
  revalidatePath('/team')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deactivateEmployee(userId: string): Promise<{ error?: string; success?: boolean }> {
  const authErr = await assertManager()
  if (authErr) return authErr

  const admin = createAdminClient()

  const { error: dbErr } = await admin
    .from('users')
    .update({ active: false })
    .eq('id', userId)
  if (dbErr) return { error: dbErr.message }

  await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

  revalidatePath('/employees')
  revalidatePath('/team')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function reactivateEmployee(userId: string): Promise<{ error?: string; success?: boolean }> {
  const authErr = await assertManager()
  if (authErr) return authErr

  const admin = createAdminClient()

  const { error: dbErr } = await admin
    .from('users')
    .update({ active: true })
    .eq('id', userId)
  if (dbErr) return { error: dbErr.message }

  await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })

  revalidatePath('/employees')
  revalidatePath('/team')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}
