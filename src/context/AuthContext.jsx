import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfile, signIn as authenticate, signOut as endSession, signUp as register } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, session: null, role: null, studentId: null, loading: true })

  useEffect(() => {
    if (!supabase) {
      setState((current) => ({ ...current, loading: false }))
      return undefined
    }
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      await hydrate(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => hydrate(session))
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  async function hydrate(session) {
    if (!session) {
      setState({ user: null, session: null, role: null, studentId: null, loading: false })
      return
    }
    const { data: profile } = await getProfile(session.user.id)
    setState({ user: session.user, session, role: profile?.role ?? null, studentId: profile?.student_id ?? null, loading: false })
  }

  async function signIn(email, password) {
    const result = await authenticate(email, password)
    if (result.error) throw result.error
    await hydrate(result.data.session)
  }

  async function signUp(registerNumber, password) {
    const result = await register(registerNumber, password)
    if (result.error) throw result.error
    if (result.data.session) await hydrate(result.data.session)
    return result.data
  }

  async function signOut() {
    await endSession()
    setState({ user: null, session: null, role: null, studentId: null, loading: false })
  }

  return <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}