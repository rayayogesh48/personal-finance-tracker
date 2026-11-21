import { useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarDays,
  CalendarClock,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  Menu,
  PieChart,
  PiggyBank,
  Plus,
  Settings,
  Wallet,
  Users,
  ArrowDownLeft,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Confirm } from './confirm'
import { AccountMenu, SyncBadge } from './cloud-ui'
import { useAuth } from '@/lib/auth'
import { KIND_STYLE } from './badges'
import { QUICK_ACTIONS, useTx } from './tx-dialogs'
import { go, type Route } from '@/lib/router'
import { useStore } from '@/lib/store'
import { alerts, cashSummary } from '@/lib/finance'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TxKind } from '@/lib/types'

const NAV: { group: string; items: { route: Route; label: string; icon: LucideIcon }[] }[] = [
  {
    group: 'Overview',
    items: [
      { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { route: 'transactions', label: 'Transactions', icon: ListOrdered },
      { route: 'cashflow', label: 'Cash flow', icon: CalendarDays },
      { route: 'insights', label: 'Insights', icon: Lightbulb },
    ],
  },
  {
    group: 'Money',
    items: [
      { route: 'income', label: 'Income', icon: ArrowDownLeft },
      { route: 'budget', label: 'Budget', icon: PieChart },
      { route: 'debts', label: 'Debts & loans', icon: HandCoins },
      { route: 'bills', label: 'Bills & EMI', icon: CalendarClock },
      { route: 'savings', label: 'Savings goals', icon: PiggyBank },
    ],
  },
  {
    group: 'Shared',
    items: [{ route: 'groups', label: 'Groups', icon: Users }],
  },
]

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { data, startFresh } = useStore()
  const { demo, exitDemo } = useAuth()
  const { openNew } = useTx()
  const [more, setMore] = useState(false)
  const [quick, setQuick] = useState(false)
  const [hideDemo, setHideDemo] = useState(() => {
    try {
      return sessionStorage.getItem('pl-hide-demo') === '1'
    } catch {
      return false
    }
  })
  const cash = cashSummary(data)
  const list = alerts(data)
  const urgent = list.filter((a) => a.tone === 'danger').length

  const quickNew = (kind: TxKind) => openNew({ kind, status: 'completed', ...(kind === 'debt_payment' ? { category: 'Debt' } : kind === 'savings' ? { category: 'Savings' } : kind === 'transfer' ? { category: 'Transfer' } : {}) })

  const Bellbox = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${list.length})`}>
          <Bell />
          {list.length > 0 && <span className={cn('absolute top-1 right-1 size-2 rounded-full ring-2 ring-background', urgent ? 'bg-overdue' : 'bg-upcoming')} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
        <div className="max-h-96 overflow-y-auto p-2">
          {!data.settings.notifications.enabled && <p className="p-3 text-xs text-muted-foreground">Payment reminders are turned off in Settings.</p>}
          {list.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            list.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => a.route && go(a.route as Route)}
                className="flex w-full gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted"
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.tone === 'danger' ? 'bg-overdue' : a.tone === 'warning' ? 'bg-upcoming' : 'bg-bill')} />
                <span>
                  <span className="block text-sm font-medium">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.detail}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-surface px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-foreground text-background">
            <Wallet className="size-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">PocketLedger</div>
            <div className="text-[11px] text-muted-foreground">{data.settings.name ? `${data.settings.name}'s money` : 'Personal finance'}</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="mb-1 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{g.group}</div>
              <div className="grid gap-0.5">
                {g.items.map((i) => (
                  <NavLink route={route} key={i.route} r={i.route} label={i.label} icon={i.icon} />
                ))}
              </div>
            </div>
          ))}
          <div className="mt-auto grid gap-0.5">
            <AccountMenu />
            <SyncBadge />
            <NavLink route={route} r="settings" label="Settings" icon={Settings} />
          </div>
        </nav>
        <div className="mt-4 rounded-xl border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Available now</div>
          <div className="text-base font-semibold tabular">{money(cash.available)}</div>
          {cash.reserved > 0 && <div className="text-[11px] text-reserved">{money(cash.reserved)} reserved</div>}
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/85 px-4 py-2.5 backdrop-blur md:ml-60 md:px-8">
        <div className="flex items-center gap-2 md:hidden">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
            <Wallet className="size-3.5" />
          </span>
          <span className="text-sm font-semibold">PocketLedger</span>
        </div>
        <div className="hidden text-xs text-muted-foreground md:block">{(demo || data.isDemo) && <span className="rounded-full bg-upcoming-soft px-2 py-0.5 font-medium text-upcoming">{demo ? 'Demo mode' : 'Demo data'}</span>}</div>
        <div className="flex items-center gap-1">
          {Bellbox}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="hidden md:inline-flex">
                <Plus /> New <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {QUICK_ACTIONS.map((q) => {
                const Icon = KIND_STYLE[q.kind].icon
                return (
                  <DropdownMenuItem key={q.kind} onClick={() => quickNew(q.kind)}>
                    <Icon className={KIND_STYLE[q.kind].text} /> {q.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="px-4 pt-5 pb-28 sm:px-6 md:ml-60 md:px-8 md:pt-7 md:pb-12">
        <div className="mx-auto max-w-6xl">
          {demo && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-upcoming/30 bg-upcoming-soft px-4 py-3 text-sm sm:flex-row sm:items-center">
              <div className="flex-1">
                <span className="font-medium">You're exploring the demo.</span>{' '}
                <span className="text-foreground/70">Try anything — it's sample data and nothing is saved. Create an account to track your own money.</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => exitDemo('register')}>
                  Create free account
                </Button>
                <Button size="sm" variant="outline" className="bg-card" onClick={() => exitDemo('login')}>
                  Exit demo
                </Button>
              </div>
            </div>
          )}
          {!demo && data.isDemo && !hideDemo && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-upcoming/30 bg-upcoming-soft px-4 py-3 text-sm sm:flex-row sm:items-center">
              <div className="flex-1">
                <span className="font-medium">You're viewing demo data.</span>{' '}
                <span className="text-foreground/70">Everything here is sample information you can edit, delete, or replace with your own.</span>
              </div>
              <div className="flex gap-2">
                <Confirm
                  trigger={
                    <Button size="sm" variant="outline" className="bg-card">
                      Start fresh
                    </Button>
                  }
                  title="Clear the demo data?"
                  description="All sample transactions, debts, bills and goals are removed. Your settings are kept. You can restore the demo any time from Settings."
                  confirmLabel="Clear demo data"
                  onConfirm={() => {
                    startFresh()
                    toast.success('Demo data cleared — add your first transaction')
                  }}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Hide demo notice"
                  onClick={() => {
                    setHideDemo(true)
                    try {
                      sessionStorage.setItem('pl-hide-demo', '1')
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <X />
                </Button>
              </div>
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5 items-end px-2">
          <BottomItem active={route === 'dashboard'} label="Home" icon={LayoutDashboard} onClick={() => go('dashboard')} />
          <BottomItem active={route === 'transactions'} label="Activity" icon={ListOrdered} onClick={() => go('transactions')} />
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="New transaction"
              onClick={() => setQuick(true)}
              className="pressable -mt-5 inline-flex size-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg"
            >
              <Plus className="size-6" />
            </button>
          </div>
          <BottomItem active={route === 'cashflow'} label="Calendar" icon={CalendarDays} onClick={() => go('cashflow')} />
          <BottomItem active={!['dashboard', 'transactions', 'cashflow'].includes(route)} label="More" icon={Menu} onClick={() => setMore(true)} />
        </div>
      </nav>

      {/* Mobile quick actions */}
      <Sheet open={quick} onOpenChange={setQuick}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]">
          <SheetHeader>
            <SheetTitle>What would you like to add?</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1 px-4">
            {QUICK_ACTIONS.map((q) => {
              const s = KIND_STYLE[q.kind]
              const Icon = s.icon
              return (
                <button
                  type="button"
                  key={q.kind}
                  onClick={() => {
                    setQuick(false)
                    quickNew(q.kind)
                  }}
                  className="pressable flex items-center gap-3 rounded-xl px-2 py-3 text-left text-base font-medium hover:bg-muted"
                >
                  <span className={cn('inline-flex size-10 items-center justify-center rounded-xl', s.chip)}>
                    <Icon className="size-5" />
                  </span>
                  {q.label}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 px-4">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="mb-1 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.group}</div>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map((i) => (
                    <NavLink route={route} key={i.route} r={i.route} label={i.label} icon={i.icon} onClick={() => setMore(false)} />
                  ))}
                </div>
              </div>
            ))}
            <div onClick={() => setMore(false)}>
              <AccountMenu />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <NavLink route={route} r="settings" label="Settings" icon={Settings} onClick={() => setMore(false)} />
              <div onClick={() => setMore(false)}>
                <SyncBadge />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function BottomItem({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('pressable flex flex-col items-center gap-0.5 py-2.5 text-[11px]', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
      <Icon className="size-5" />
      {label}
    </button>
  )
}

function NavLink({ route, r, label, icon: Icon, onClick }: { route: Route; r: Route; label: string; icon: LucideIcon; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        go(r)
        onClick?.()
      }}
      aria-current={route === r ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150',
        route === r ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-foreground/8' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}
