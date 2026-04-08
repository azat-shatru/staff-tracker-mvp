'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function signup(formData: FormData) {
  const name          = (formData.get('name')          as string).trim()
  const email         = (formData.get('email')         as string).trim()
  const password      =  formData.get('password')      as string
  const confirm       =  formData.get('confirm')        as string
  const role          =  formData.get('role')           as string
  const team          = (formData.get('team')           as string).trim()
  const reports_to    =  formData.get('reports_to')    as string | null
  const capacity_hours = Number(formData.get('capacity_hours')) || 40

  if (!name || !email || !password)
    return { error: 'Name, email and password are required.' }
  if (password !== confirm)
    return { error: 'Passwords do not match.' }
  if (password.length < 8)
    return { error: 'Password must be at least 8 characters.' }

  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  })

  if (error)        return { error: error.message }
  if (!data.user)   return { error: 'Signup failed. Please try again.' }

  // Upsert the full profile row (trigger may have already created a partial one)
  const { error: profileError } = await admin
    .from('users')
    .upsert({
      id:             data.user.id,
      name,
      email,
      role,
      team:           team || '',
      reports_to:     reports_to || null,
      capacity_hours,
    }, { onConflict: 'id' })

  if (profileError) return { error: profileError.message }

  // No session = email confirmation required
  if (!data.session) return { success: true, needsConfirmation: true }

  redirect('/dashboard')
}
