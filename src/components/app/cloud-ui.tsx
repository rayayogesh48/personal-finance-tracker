import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronsUpDown, Cloud, CloudOff, Loader2, LogOut, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Panel } from './page'
import { useCloud, type SyncStatus } from '@/lib/cloud'
import { useStore } from '@/lib/store'
import { cashSummary } from '@/lib/finance'
import { money } from '@/lib/format'
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

/** "just now", "5 min ago", "2 h ago" */
function ago(iso?: string) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : format(parseISO(iso), 'd MMM')
}

const DOT: Record<SyncStatus, string> = {
  synced: 'bg-income',
  saving: 'bg-upcoming',
  connecting: 'bg-upcoming',
  offline: 'bg-upcoming',
  error: 'bg-expense',
  'setup-needed': 'bg-expense',
  conflict: 'bg-expense',
  off: 'bg-muted-foreground',
  'signed-out': 'bg-muted-foreground',
}

/**
 * Sidebar footer: what you can spend right now, plus who you are and whether
 * your data is saved — one card instead of four loose rows.
 */
export function AccountCard({ onNavigate }: { onNavigate?: () => void }) {
  const cloud = useCloud()
  const { data } = useStore()
  const cash = cashSummary(data)
  const { session, demo, status, lastSyncedAt, signOut, exitDemo, syncNow } = cloud

  const balance = (
    <div className="px-3.5 pt-3 pb-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Available now</span>
        {cash.reserved > 0 && <span className="rounded-full bg-reserved-soft px-1.5 py-px font-medium text-reserved tabular">{money(cash.reserved)} set aside</span>}
      </div>
      <div className="mt-0.5 text-lg leading-tight font-semibold tracking-tight tabular">{money(cash.available)}</div>
    </div>
  )

  if (demo)
    return (
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        {balance}
        <div className="grid gap-2 border-t bg-upcoming-soft/50 px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-upcoming">
            <Sparkles className="size-3.5" /> Demo · nothing is saved
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" onClick={() => (onNavigate?.(), exitDemo('register'))}>
              Sign up
            </Button>
            <Button size="sm" variant="outline" className="bg-card" onClick={() => (onNavigate?.(), exitDemo('login'))}>
              Exit
            </Button>
          </div>
        </div>
      </div>
    )

  if (!session) return <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">{balance}</div>

  const email = session.user.email ?? ''
  const name = (session.user.user_metadata?.name as string | undefined) || data.settings.name || email.split('@')[0]
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
  const statusText = status === 'synced' ? (lastSyncedAt ? `Saved ${ago(lastSyncedAt)}` : 'Synced') : LABEL[status]

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      {balance}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account: ${name}, ${statusText}`}
            className="flex w-full items-center gap-2.5 border-t px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/60 data-[state=open]:bg-muted/60"
          >
            <span className="relative shrink-0">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">{initials || '?'}</span>
              <span className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card', DOT[status])} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className={cn('block truncate text-[11px]', status === 'synced' ? 'text-muted-foreground' : tone(status))}>{statusText}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={status === 'saving' || status === 'connecting' || status === 'conflict'}
            onSelect={(e) => {
              e.preventDefault()
              void syncNow()
            }}
          >
            {status === 'saving' || status === 'connecting' ? <Loader2 className="animate-spin" /> : status === 'synced' ? <Cloud /> : status === 'offline' ? <CloudOff /> : <RefreshCw />}
            <span className="flex-1">{status === 'synced' ? 'Sync now' : LABEL[status]}</span>
            {status === 'synced' && lastSyncedAt && <span className="text-[11px] text-muted-foreground">{ago(lastSyncedAt)}</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => (onNavigate?.(), go('settings'))}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              onNavigate?.()
              await signOut()
              toast('Signed out')
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
