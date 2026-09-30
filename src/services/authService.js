import { supabase } from '../lib/supabase'

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase.auth.signInWithPassword({ email, password })
}

export function universityEmail(registerNumber) {
  const normalized = registerNumber.trim().toLowerCase()
  return normalized.endsWith('@klu.ac.in') ? normalized : `${normalized}@klu.ac.in`
}

export async function signUp(registerNumber, password) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const email = universityEmail(registerNumber)
  const redirectTo = import.meta.env.VITE_SITE_URL || window.location.origin
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { register_number: registerNumber.trim() },
    },
  })
}

export async function signOut() {
  if (supabase) return supabase.auth.signOut()
}

export async function getProfile(userId) {
  if (!supabase || !userId) return { data: null, error: null }
  return supabase
    .from('user_profiles')
    .select('role, student_id')
    .eq('user_id', userId)
    .maybeSingle()
}