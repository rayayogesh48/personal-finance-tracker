import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { demoService } from './demo'
import { clearUserCache } from './store'
import { go } from './router'

interface Auth {
  configured: boolean
  /** false until the stored session has been read — avoids flashing the login screen */
  ready: boolean
  session: Session | null
  demo: boolean
  recovering: boolean
  startDemo: () => void
  /** Leave the demo (discarding it) and go to sign in or registration. */
  exitDemo: (to?: 'login' | 'register') => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null; needsConfirm: boolean }>
  magicLink: (email: string) => Promise<string | null>
  sendReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<Auth | null>(null)
const redirectTo = () => `${window.location.origin}${window.location.pathname}`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [demo, setDemo] = useState(demoService.isActive)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setReady(true)
      if (s) {
        // Signing in always leaves the demo sandbox.
        demoService.exit()
        setDemo(false)
      }
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true)
        go('reset')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<Auth>(
    () => ({
      configured: !!supabase,
      ready,
      session,
      demo,
      recovering,
      startDemo() {
        demoService.start(true)
        setDemo(true)
        go('dashboard')
      },
      exitDemo(to = 'login') {
        demoService.exit()
        setDemo(false)
        go(to)
      },
      async signIn(email, password) {
        if (!supabase) return 'Cloud sync is not configured'
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
      },
      async signUp(email, password, name) {
        if (!supabase) return { error: 'Cloud sync is not configured', needsConfirm: false }
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo(), data: name ? { name } : undefined } })
        return { error: error?.message ?? null, needsConfirm: !error && !data.session }
      },
      async magicLink(email) {
        if (!supabase) return 'Cloud sync is not configured'
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: false } })
        return error?.message ?? null
      },
      async sendReset(email) {
        if (!supabase) return 'Cloud sync is not configured'
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
        return error?.message ?? null
      },
      async updatePassword(password) {
        if (!supabase) return 'Cloud sync is not configured'
        const { error } = await supabase.auth.updateUser({ password })
        if (!error) setRecovering(false)
        return error?.message ?? null
      },
      async signOut() {
        if (!supabase) return
        const id = session?.user.id
        await supabase.auth.signOut()
        // Don't leave a copy of someone's finances on a shared device.
        if (id) clearUserCache(id)
        go('login')
      },
    }),
    [ready, session, demo, recovering],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
