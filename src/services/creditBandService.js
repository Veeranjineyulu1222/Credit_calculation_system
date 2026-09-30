import { supabase } from '../lib/supabase'

export async function getCreditBands(policyId) {
  if (!supabase) return { data: [], error: null }
  let query = supabase.from('credit_allocation_bands').select('id, policy_id, reference_credits, percentile_min, percentile_max, credits_awarded, band_name').order('percentile_min')
  if (policyId) query = query.eq('policy_id', policyId)
  return query
}