import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useStore } from './store'
import { useAuth } from './auth'
import { diff, fromRows, OWNER, PK, sameData, snapshot, TABLES, toRows, type Table } from './cloud-mapping'
import type { AppData } from './types'

export type SyncStatus = 'off' | 'signed-out' | 'connecting' | 'synced' | 'saving' | 'offline' | 'error' | 'setup-needed' | 'conflict'

interface Conflict {
  remote: AppData
  remoteUpdatedAt: string
}

interface Sync {
  status: SyncStatus
  error?: string
  lastSyncedAt?: string
  conflict: Conflict | null
  /** First load for this account on this device — nothing cached to show yet */
  initialLoading: boolean
  syncNow: () => Promise<void>
  resolveConflict: (keep: 'cloud' | 'device') => Promise<void>
}

const Ctx = createContext<Sync | null>(null)
const PAGE = 1000

type PgError = { code?: string; message?: string } | null
const isMissingTable = (e: PgError) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message ?? ''))

class SyncError extends Error {
  missingTable: boolean
  constructor(message: string, missingTable = false) {
    super(message)
    this.missingTable = missingTable
  }
}

type Snap = ReturnType<typeof snapshot>

// ------------------------------------------------------------------ network helpers

/** Read every table for this user (paged, so large ledgers aren't truncated). */
async function fetchAll(userId: string): Promise<Record<Table, Record<string, unknown>[]>> {
  const sb = supabase!
  const out = {} as Record<Table, Record<string, unknown>[]>
  await Promise.all(
    TABLES.map(async (t) => {
      const rows: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from(t)
          .select('*')
          .eq(OWNER[t], userId)
          .order(PK[t][0])
          .range(from, from + PAGE - 1)
        if (error) throw new SyncError(error.message, isMissingTable(error))
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      out[t] = rows
    }),
  )
  return out
}

/** Apply a diff: deletes children-first, then upserts parents-first. */
async function applyDiff(userId: string, upserts: Record<Table, Record<string, unknown>[]>, deletes: Record<Table, string[]>) {
  const sb = supabase!
  for (const t of [...TABLES].reverse()) {
    const keys = deletes[t]
    if (!keys.length || t === 'profiles') continue
    const pk = PK[t]
    if (pk[0] === 'user_id') {
      const { error } = await sb.from(t).delete().eq('user_id', userId)
      if (error) throw new SyncError(error.message, isMissingTable(error))
    } else if (pk.length === 1) {
      for (let i = 0; i < keys.length; i += 200) {
        const { error } = await sb.from(t).delete().eq(OWNER[t], userId).in(pk[0], keys.slice(i, i + 200))
        if (error) throw new SyncError(error.message, isMissingTable(error))
      }
    } else {
      // composite key (categories: type|name)
      const groups = new Map<string, string[]>()
      for (const k of keys) {
        const [a, ...rest] = k.split('|')
        groups.set(a, [...(groups.get(a) ?? []), rest.join('|')])
      }
      for (const [a, bs] of groups) {
        const { error } = await sb.from(t).delete().eq(OWNER[t], userId).eq(pk[0], a).in(pk[1], bs)
        if (error) throw new SyncError(error.message, isMissingTable(error))
      }
    }
  }
  for (const t of TABLES) {
    const rows = upserts[t]
    if (!rows.length) continue
    const onConflict = [...new Set([OWNER[t], ...PK[t]])].join(',')
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(t).upsert(rows.slice(i, i + 500), { onConflict })
      if (error) throw new SyncError(`${t}: ${error.message}`, isMissingTable(error))
    }
  }
}

// ------------------------------------------------------------------ provider

/** Keeps a signed-in user's store in sync with Supabase. Mount inside StoreProvider. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, replaceAll, hadCache } = useStore()
  const { session } = useAuth()
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signed-out' : 'off')
  const [error, setError] = useState<string>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string>()
  const [conflict, setConflict] = useState<Conflict | null>(null)

  /** What the database holds, as keyed row snapshots — the base for diffs. */
  const snap = useRef<Snap | null>(null)
  /** Only push after the initial pull/merge has finished. */
  const ready = useRef(false)
  /** Serialises pushes so two never overlap. */
  const queue = useRef<Promise<void>>(Promise.resolve())
  const busy = useRef(false)
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const userId = session?.user.id
  const email = session?.user.email

  const fail = useCallback((e: unknown) => {
    if (e instanceof SyncError && e.missingTable) return setStatus('setup-needed')
    setError(e instanceof Error ? e.message : String(e))
    setStatus(navigator.onLine ? 'error' : 'offline')
  }, [])

  // ---------------------------------------------------------------- push
  const push = useCallback(
    (d: AppData) => {
      if (!supabase || !userId) return Promise.resolve()
      queue.current = queue.current.then(async () => {
        const { upserts, deletes, next } = diff(snap.current, toRows(d, userId, email))
        const changes = TABLES.reduce((a, t) => a + upserts[t].length + deletes[t].length, 0)
        if (!changes) return
        busy.current = true
        setStatus('saving')
        try {
          await applyDiff(userId, upserts, deletes)
          snap.current = next
          setLastSyncedAt(new Date().toISOString())
          setError(undefined)
          setStatus('synced')
        } catch (e) {
          fail(e)
        } finally {
          busy.current = false
        }
      })
      return queue.current
    },
    [userId, email, fail],
  )

  // ---------------------------------------------------------------- initial pull & merge
  const pull = useCallback(async () => {
    if (!supabase || !userId) return
    ready.current = false
    setStatus('connecting')
    try {
      const rows = await fetchAll(userId)
      const remote = fromRows(rows)
      const local = dataRef.current
      if (!remote) {
        // Nothing in the cloud yet: this device's ledger becomes the account's data.
        snap.current = snapshot({ ...(Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<Table, Record<string, unknown>[]>), profiles: rows.profiles })
        ready.current = true
        await push(local)
        return
      }
      const remoteSnap = snapshot(toRows(remote, userId, email))
      // Take the cloud copy silently when: identical, nothing cached here yet, or this device only holds
      // demo data while the cloud holds real data (e.g. demo data was cleared on another device).
      if (sameData(remote, local, userId) || !hadCache || (local.isDemo && !remote.isDemo)) {
        snap.current = remoteSnap
        if (!sameData(remote, local, userId)) replaceAll(remote)
        setLastSyncedAt(new Date().toISOString())
        ready.current = true
        setStatus('synced')
        return
      }
      snap.current = remoteSnap
      const latest = Object.values(rows)
        .flat()
        .map((r) => String(r.updated_at ?? ''))
        .sort()
        .at(-1)
      setConflict({ remote, remoteUpdatedAt: latest || new Date().toISOString() })
      setStatus('conflict')
    } catch (e) {
      fail(e)
    }
  }, [userId, email, push, replaceAll, fail, hadCache])

  useEffect(() => {
    if (!supabase) return
    if (!userId) {
      ready.current = false
      snap.current = null
      setConflict(null)
      setStatus('signed-out')
      return
    }
    void pull()
  }, [userId, pull])

  // ---------------------------------------------------------------- debounced auto-save
  useEffect(() => {
    if (!userId || !ready.current) return
    const t = setTimeout(() => void push(data), 800)
    return () => clearTimeout(t)
  }, [data, userId, push])

  // ---------------------------------------------------------------- realtime (other devices)
  useEffect(() => {
    if (!supabase || !userId) return
    const client = supabase
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        if (!ready.current || busy.current) return
        // Unsaved local edits win; they'll be pushed by the auto-save.
        const pending = diff(snap.current, toRows(dataRef.current, userId, email))
        if (TABLES.some((t) => pending.upserts[t].length || pending.deletes[t].length)) return
        try {
          const remote = fromRows(await fetchAll(userId))
          if (!remote || sameData(remote, dataRef.current, userId)) return
          snap.current = snapshot(toRows(remote, userId, email))
          replaceAll(remote)
          setLastSyncedAt(new Date().toISOString())
          setStatus('synced')
        } catch (e) {
          fail(e)
        }
      }, 600)
    }
    let ch: RealtimeChannel = client.channel(`pocketledger-${userId}`)
    for (const t of TABLES) {
      if (t === 'profiles') continue
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `user_id=eq.${userId}` }, refresh)
    }
    ch.subscribe()
    return () => {
      clearTimeout(timer)
      void client.removeChannel(ch)
    }
  }, [userId, email, replaceAll, fail])

  // ---------------------------------------------------------------- reconnect
  useEffect(() => {
    const on = () => {
      if (userId && ready.current) void push(dataRef.current)
      else if (userId) void pull()
    }
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [userId, push, pull])

  const value = useMemo<Sync>(
    () => ({
      status,
      error,
      lastSyncedAt,
      conflict,
      initialLoading: !hadCache && (status === 'connecting' || status === 'signed-out'),
      async syncNow() {
        if (ready.current) await push(dataRef.current)
        else await pull()
      },
      async resolveConflict(keep) {
        if (!conflict) return
        if (keep === 'cloud') {
          replaceAll(conflict.remote)
          setLastSyncedAt(conflict.remoteUpdatedAt)
          setStatus('synced')
          setConflict(null)
          ready.current = true
        } else {
          setConflict(null)
          ready.current = true
          await push(dataRef.current) // diff against the cloud snapshot → overwrites cloud rows
        }
      },
    }),
    [status, error, lastSyncedAt, conflict, hadCache, push, pull, replaceAll],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const OFF: Sync = { status: 'off', conflict: null, initialLoading: false, syncNow: async () => {}, resolveConflict: async () => {} }

/** Sync state (or an inert default outside a signed-in workspace, e.g. demo mode). */
// eslint-disable-next-line react-refresh/only-export-components
export function useSync() {
  return useContext(Ctx) ?? OFF
}

/** Auth + sync in one object, for UI that shows both. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCloud() {
  return { ...useAuth(), ...useSync() }
}
