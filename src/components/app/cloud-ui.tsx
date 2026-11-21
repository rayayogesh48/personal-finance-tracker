import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Cloud, CloudOff, Loader2, LogOut, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Panel } from './page'
import { useCloud, type SyncStatus } from '@/lib/cloud'
import { useStore } from '@/lib/store'
import { go } from '@/lib/router'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

const LABEL: Record<SyncStatus, string> = {
  off: 'Local only',
  'signed-out': 'Not synced',
  connecting: 'Connecting…',
  synced: 'Synced',
  saving: 'Saving…',
  offline: 'Offline — will retry',
  error: 'Sync error',
  'setup-needed': 'Cloud setup needed',
  conflict: 'Choose a copy',
}

const tone = (s: SyncStatus) =>
  s === 'synced' ? 'text-income' : s === 'error' || s === 'setup-needed' || s === 'conflict' ? 'text-expense' : s === 'offline' ? 'text-upcoming' : 'text-muted-foreground'

/** Compact status shown in the sidebar. */
export function SyncBadge() {
  const { status, session, demo } = useCloud()
  if (demo)
    return (
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-upcoming">
        <Sparkles className="size-3.5" /> Demo mode — not saved
      </div>
    )
  const Icon = status === 'saving' || status === 'connecting' ? Loader2 : status === 'off' || status === 'signed-out' || status === 'offline' ? CloudOff : status === 'synced' ? Cloud : AlertTriangle
  return (
    <button type="button" onClick={() => go(session ? 'settings' : 'login')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-card/70" title={session?.user.email ?? 'Sign in to sync'}>
      <Icon className={cn('size-3.5 shrink-0', tone(status), (status === 'saving' || status === 'connecting') && 'animate-spin')} />
      <span className={cn('truncate', tone(status))}>{status === 'signed-out' ? 'Sign in to sync' : LABEL[status]}</span>
    </button>
  )
}

/** Settings → Account & sync */
export function AccountPanel() {
  const cloud = useCloud()
  if (!cloud.configured)
    return (
      <Panel title="Account & sync" className="lg:col-span-2">
        <p className="text-sm text-muted-foreground">
          Cloud sync is off. Add <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-muted px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code className="rounded bg-muted px-1">.env.local</code> and restart the app.
        </p>
      </Panel>
    )

  if (cloud.session) {
    const s = cloud.status
    return (
      <Panel title="Account & sync" className="lg:col-span-2">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="grid gap-1 text-sm">
            <div>
              Signed in as <b>{cloud.session.user.email}</b>
            </div>
            <div className={cn('flex items-center gap-1.5 text-xs', tone(s))}>
              {LABEL[s]}
              {s === 'synced' && cloud.lastSyncedAt && <span className="text-muted-foreground">· last saved {format(parseISO(cloud.lastSyncedAt), 'd MMM, HH:mm')}</span>}
            </div>
            {cloud.error && (s === 'error' || s === 'offline') && <div className="text-xs text-expense">{cloud.error}</div>}
            <p className="text-xs text-muted-foreground">Changes save to the cloud automatically and appear on your other signed-in devices. This device keeps an offline copy.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void cloud.syncNow()} disabled={s === 'saving' || s === 'connecting' || s === 'conflict'}>
              <RefreshCw /> Sync now
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await cloud.signOut()
                toast('Signed out — your data stays on this device')
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
        {s === 'setup-needed' && (
          <div className="mt-4 rounded-xl bg-expense-soft p-3 text-sm">
            <div className="font-medium text-expense">Your Supabase project needs one-time setup</div>
            <p className="mt-1 text-foreground/80">
              Open your Supabase dashboard → SQL Editor, paste the contents of <code className="rounded bg-card px-1">supabase/migrations/20261121120000_pocketledger_schema.sql</code>, run it, then press Sync now.
            </p>
          </div>
        )}
      </Panel>
    )
  }

  return (
    <Panel title="Account" description={cloud.demo ? "You're in demo mode. Nothing you change here is saved. Create an account to track your own money." : 'Sign in to use PocketLedger.'} className="lg:col-span-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => cloud.exitDemo('register')}>Create free account</Button>
        <Button variant="outline" onClick={() => cloud.exitDemo('login')}>
          Sign in
        </Button>
      </div>
    </Panel>
  )
}

/** Shown when this device and the cloud both hold different real data. */
export function ConflictDialog() {
  const { conflict, resolveConflict } = useCloud()
  const { data } = useStore()
  const [busy, setBusy] = useState(false)
  if (!conflict) return null
  const r = conflict.remote
  const choose = async (k: 'cloud' | 'device') => {
    setBusy(true)
    await resolveConflict(k)
    setBusy(false)
    toast.success(k === 'cloud' ? 'Loaded your cloud ledger' : 'Cloud updated with this device’s ledger')
  }
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Which ledger do you want to keep?</AlertDialogTitle>
          <AlertDialogDescription>This device and your cloud account hold different data. The one you don't pick will be replaced.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border p-3">
            <div className="font-medium">Cloud</div>
            <div className="text-xs text-muted-foreground">Saved {format(parseISO(conflict.remoteUpdatedAt), 'd MMM yyyy, HH:mm')}</div>
            <div className="mt-2 text-xs">
              {r.transactions.length} transactions · {r.debts.length} debts · {r.bills.length} bills
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="font-medium">This device</div>
            <div className="text-xs text-muted-foreground">Current</div>
            <div className="mt-2 text-xs">
              {data.transactions.length} transactions · {data.debts.length} debts · {data.bills.length} bills
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void choose('device')}>
            Keep this device
          </Button>
          <Button disabled={busy} onClick={() => void choose('cloud')}>
            Use cloud copy
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Sidebar account row: who's signed in, with Settings and Sign out. */
export function AccountMenu() {
  const { session, demo, signOut, exitDemo } = useCloud()
  if (demo)
    return (
      <div className="grid gap-1.5 rounded-xl border border-upcoming/30 bg-upcoming-soft p-3 text-xs">
        <div className="font-medium text-upcoming">You're exploring the demo</div>
        <Button size="sm" onClick={() => exitDemo('register')}>
          Create free account
        </Button>
        <Button size="sm" variant="ghost" onClick={() => exitDemo('login')}>
          Exit demo
        </Button>
      </div>
    )
  if (!session) return null
  const email = session.user.email ?? ''
  const name = (session.user.user_metadata?.name as string | undefined) ?? ''
  const initials = (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-card/70" aria-label="Account menu">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">{initials || '?'}</span>
          <span className="min-w-0 leading-tight">
            {name && <span className="block truncate text-sm font-medium">{name}</span>}
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go('settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await signOut()
            toast('Signed out')
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
