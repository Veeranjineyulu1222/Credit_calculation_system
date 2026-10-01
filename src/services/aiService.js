import { supabase } from '../lib/supabase'

export async function askCompetencyInsight(question, history = []) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }

  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionResult.session?.access_token) {
    return { data: null, error: new Error('Your session has expired. Please sign in again.') }
  }

  let response
  try {
    response = await fetch('/api/ai/competency-insights', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionResult.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, history }),
    })
  } catch {
    return { data: null, error: new Error('AI insights are temporarily unavailable. Your competency data is still available.') }
  }

  let payload = {}
  try { payload = await response.json() } catch { payload = {} }
  if (!response.ok) return { data: null, error: new Error(payload.error || 'AI insights are temporarily unavailable. Your competency data is still available.') }
  return { data: payload, error: null }
}
