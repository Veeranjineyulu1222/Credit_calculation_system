import { supabase } from '../lib/supabase'

const API_BASE_URL = import.meta.env.VITE_RAG_API_URL || ''

async function getAccessToken() {
  if (!supabase) return { token: null, error: new Error('Supabase configuration is missing.') }
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionResult.session?.access_token) return { token: null, error: new Error('Your session has expired. Please sign in again.') }
  return { token: sessionResult.session.access_token, error: null }
}

export async function askCompetencyInsight(question, history = [], conversationId = null) {
  const { token, error: tokenError } = await getAccessToken()
  if (tokenError) return { data: null, error: tokenError }

  let response
  try {
    const url = `${API_BASE_URL}/api/ai/chat`
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, history }),
    })
  } catch {
    return { data: null, error: new Error('AI Assistant server is temporarily offline. Please try again.') }
  }

  let payload = {}
  try { payload = await response.json() } catch { payload = {} }
  if (!response.ok) return { data: null, error: new Error(payload.detail || payload.error || 'AI Assistant is temporarily unavailable. Please try again.') }
  
  // Format payload for frontend UI compatibility
  return { 
    data: {
      answer: payload.answer,
      conversation_id: conversationId || `conv-${Date.now()}`
    }, 
    error: null 
  }
}

export async function getCompetencyConversations() {
  // Return local state conversations for AI Insights to prevent RAG DB errors
  return { data: { conversations: [] }, error: null }
}
