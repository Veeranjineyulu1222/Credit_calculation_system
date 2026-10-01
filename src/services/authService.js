import { supabase } from '../lib/supabase'

export function normalizeRegisterNumber(registerNumber) {
  return String(registerNumber ?? '').trim().replace(/@klu\.ac\.in$/i, '').replace(/\s+/g, '')
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase.auth.signInWithPassword({ email, password })
}

export function universityEmail(registerNumber) {
  const normalized = normalizeRegisterNumber(registerNumber).toLowerCase()
  return normalized.endsWith('@klu.ac.in') ? normalized : `${normalized}@klu.ac.in`
}

export async function validateStudentRegistration(registerNumber) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const normalized = normalizeRegisterNumber(registerNumber)
  if (!normalized) {
    return { data: false, error: new Error('Register number is required.') }
  }
  return supabase.rpc('validate_student_registration', { p_register_number: normalized })
}

export async function signUp(registerNumber, password) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const normalized = normalizeRegisterNumber(registerNumber)
  const email = universityEmail(normalized)
  const redirectTo = import.meta.env.VITE_SITE_URL || window.location.origin
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { register_number: normalized },
    },
  })
}

export async function signOut() {
  if (supabase) return supabase.auth.signOut({ scope: 'local' })
}

export async function getProfile(userId) {
  if (!supabase || !userId) return { data: null, error: null }
  return supabase
    .from('user_profiles')
    .select('role, student_id')
    .eq('user_id', userId)
    .maybeSingle()
}