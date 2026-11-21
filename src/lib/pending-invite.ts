/**
 * Captures a group invitation token from the URL (?invite=…) as early as possible —
 * before Supabase processes any sign-in tokens — and keeps it until the user has
 * signed in and accepted or dismissed it. Imported first in main.tsx.
 */
const KEY = 'pocketledger:pending-invite'

try {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('invite')
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    localStorage.setItem(KEY, token)
    url.searchParams.delete('invite')
    // keep any #hash (route or auth tokens) intact
    window.history.replaceState(window.history.state, '', url.pathname + (url.search ? url.search : '') + url.hash)
  }
} catch {
  /* storage unavailable — the invitation still shows under Groups → Invitations */
}

export const pendingInvite = {
  get: (): string | null => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  },
}
