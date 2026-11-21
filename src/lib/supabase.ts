import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** null when env vars are missing — the app then runs local-only. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      })
    : null

export const cloudConfigured = !!supabase

/**
 * The one public address of the app, used in every link we email (sign-up confirmation,
 * password reset, group invitations). Set VITE_APP_URL in production so links never point
 * at a secondary domain alias; locally it falls back to the current origin.
 */
export const APP_URL = ((import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin).replace(/\/+$/, '')
