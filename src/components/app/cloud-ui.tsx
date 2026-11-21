import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronsUpDown, Cloud, CloudOff, Loader2, LogOut, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
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
