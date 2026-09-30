import { supabase } from '../lib/supabase'

export async function getCreditPolicies() {
  if (!supabase) return { data: [], error: null }
  return supabase.from('credit_policies').select('id, policy_name, description, version, effective_from, effective_to, status').order('effective_from', { ascending: false })
}