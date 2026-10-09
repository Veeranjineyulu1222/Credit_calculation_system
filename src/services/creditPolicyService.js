import { supabase } from '../lib/supabase'

export async function getCreditPolicies() {
  if (!supabase) return { data: [], error: null }
  return supabase
    .from('credit_policies')
    .select('id, policy_name, description, version, effective_from, effective_to, status')
    .order('effective_from', { ascending: false })
}

export async function getCreditPoliciesWithBands() {
  if (!supabase) return { data: [], error: null }

  try {
    const [policyRes, bandsRes] = await Promise.all([
      supabase.from('credit_policies').select('*').order('effective_from', { ascending: false }),
      supabase.from('credit_allocation_bands').select('*').order('percentile_min', { ascending: true })
    ])

    if (policyRes.error) return { data: [], error: policyRes.error }

    const bands = bandsRes.data ?? []
    const policiesWithBands = (policyRes.data ?? []).map(pol => ({
      ...pol,
      bands: bands.filter(b => String(b.policy_id) === String(pol.id))
    }))

    return { data: policiesWithBands, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}