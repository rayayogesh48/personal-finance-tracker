import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Bell,
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileJson,
  Landmark,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Tags,
  Target,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/app/page'
import { Confirm } from '@/components/app/confirm'
import { useStore, isAppData } from '@/lib/store'
import { useCloud } from '@/lib/cloud'
import { accountBalance } from '@/lib/finance'
import { exportCsv, exportJson } from '@/lib/io'
import { fmt, money, parseAmount } from '@/lib/format'
import { go } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { AppData, Currency, DateFormat, Theme } from '@/lib/types'

const CURRENCIES: { v: Currency; l: string }[] = [
  { v: 'NPR', l: 'NPR — Nepalese rupee (Rs.)' },
  { v: 'INR', l: 'INR — Indian rupee (₹)' },
  { v: 'USD', l: 'USD — US dollar ($)' },
  { v: 'GBP', l: 'GBP — British pound (£)' },
  { v: 'EUR', l: 'EUR — Euro (€)' },
]
const DATE_FORMATS: DateFormat[] = ['d MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']

const SECTIONS = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'accounts', label: 'Money accounts', icon: Landmark },
  { id: 'goals', label: 'Budget & goals', icon: Target },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'data', label: 'Data & backup', icon: Database },
] as const

export function SettingsPage() {
  const [active, setActive] = useState<string>('account')

  // Highlight the section in view (no smooth scrolling: this is navigation, it should feel instant).
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`settings-${s.id}`)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id.replace('settings-', ''))
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const jump = (id: string) => {
    setActive(id)
    document.getElementById(`settings-${id}`)?.scrollIntoView({ block: 'start' })
  }

  return (
    <div>
      <PageHeader title="Settings" description="Your account, preferences and data." />
      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* Section index */}
        <nav className="hidden lg:block" aria-label="Settings sections">
          <ul className="sticky top-20 grid gap-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => jump(id)}
                  aria-current={active === id ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150',
                    active === id ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-foreground/8' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-10">
          <AccountSection />
          <PreferencesSection />
          <NotificationsSection />
          <MoneyAccountsSection />
          <GoalsSection />
          <CategoriesSection />
          <DataSection />
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ building blocks

function Section({ id, title, description, children }: { id: string; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-20" aria-labelledby={`settings-${id}-title`}>
      <div className="mb-3">
        <h2 id={`settings-${id}-title`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/** A card of rows separated by hairlines. */
function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-foreground/10', className)}>{children}</div>
}

/** Label + hint on the left, control on the right (stacks on small screens). */
function Row({ label, hint, children, htmlFor, className, inline }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; htmlFor?: string; className?: string; inline?: boolean }) {
  return (
    <div className={cn('flex gap-2 px-4 py-3.5 sm:gap-6 sm:px-5', inline ? 'flex-row items-center justify-between gap-4' : 'flex-col sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children && <div className="shrink-0 sm:max-w-[60%]">{children}</div>}
    </div>
  )
}

function LinkRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm transition-colors duration-150 hover:bg-muted/50 sm:px-5">
      <span className="font-medium">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <span className="truncate">{value}</span>
        <ChevronRight className="size-4 shrink-0" />
      </span>
    </button>
  )
}

// ------------------------------------------------------------------ account

function AccountSection() {
  const cloud = useCloud()
  const s = cloud.status
  if (!cloud.configured)
    return (
      <Section id="account" title="Account" description="Cloud sync is turned off for this build.">
        <Card>
          <Row label="Not connected" hint="Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local and restart the app." />
        </Card>
      </Section>
    )
  if (!cloud.session)
    return (
      <Section id="account" title="Account" description={cloud.demo ? "You're exploring the demo — nothing here is saved." : 'Sign in to keep your data safe.'}>
        <Card>
          <Row label="Track your own money" hint="Create a free account to save your data and use it on any device.">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => cloud.exitDemo('login')}>
                Sign in
              </Button>
              <Button onClick={() => cloud.exitDemo('register')}>Create account</Button>
            </div>
          </Row>
        </Card>
      </Section>
    )
  const email = cloud.session.user.email ?? ''
  const busy = s === 'saving' || s === 'connecting'
  return (
    <Section id="account" title="Account" description="Your data is saved to your private cloud account and kept on this device for offline use.">
      <Card>
        <Row label="Email" hint="Used to sign in and to receive group invitations.">
          <span className="text-sm">{email}</span>
        </Row>
        <Row
          inline
          label="Sync"
          hint={
            <span className="flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', s === 'synced' ? 'bg-income' : s === 'error' || s === 'setup-needed' || s === 'conflict' ? 'bg-expense' : 'bg-upcoming')} />
              {s === 'synced' ? `Up to date${cloud.lastSyncedAt ? ` · saved ${format(parseISO(cloud.lastSyncedAt), 'd MMM, HH:mm')}` : ''}` : s === 'saving' ? 'Saving…' : s === 'connecting' ? 'Connecting…' : s === 'offline' ? 'Offline — will retry automatically' : s === 'conflict' ? 'Choose which copy to keep' : 'Problem saving'}
            </span>
          }
        >
          <Button variant="outline" size="sm" onClick={() => void cloud.syncNow()} disabled={busy || s === 'conflict'}>
            {busy ? <Loader2 className="animate-spin" /> : s === 'offline' ? <CloudOff /> : s === 'synced' ? <Cloud /> : <RefreshCw />} Sync now
          </Button>
        </Row>
        {cloud.error && (s === 'error' || s === 'offline') && <Row label="Last error" hint={<span className="text-expense">{cloud.error}</span>} />}
        <Row inline label="Sign out" hint="Your data stays safe in the cloud; this device's copy is removed.">
          <Button
            variant="ghost"
            size="sm"
            className="text-expense hover:bg-expense-soft hover:text-expense"
            onClick={async () => {
              await cloud.signOut()
              toast('Signed out')
            }}
          >
            <LogOut /> Sign out
          </Button>
        </Row>
      </Card>
    </Section>
  )
}

// ------------------------------------------------------------------ preferences

function PreferencesSection() {
  const { data, updateSettings } = useStore()
  const s = data.settings
  const [name, setName] = useState(s.name)
  return (
    <Section id="preferences" title="Preferences" description="How My Ullu greets you and shows numbers and dates.">
      <Card>
        <Row label="Your name" hint="Used in greetings." htmlFor="pref-name">
          <Input id="pref-name" className="w-full sm:w-60" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== s.name && updateSettings({ name: name.trim() })} maxLength={30} placeholder="Your name" />
        </Row>
        <Row label="Currency" hint="Changes how amounts are shown — it doesn't convert them.">
          <Select value={s.currency} onValueChange={(v) => updateSettings({ currency: v as Currency })}>
            <SelectTrigger className="w-full sm:w-60" aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.v} value={c.v}>
                  {c.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Date format">
          <Select value={s.dateFormat} onValueChange={(v) => updateSettings({ dateFormat: v as DateFormat })}>
            <SelectTrigger className="w-full sm:w-60" aria-label="Date format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {fmt('2027-03-21', f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Theme">
          <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-muted p-1 sm:w-60" role="radiogroup" aria-label="Theme">
            {(
              [
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
                ['system', 'Auto', Monitor],
              ] as const
            ).map(([v, l, Icon]) => (
              <button
                type="button"
                role="radio"
                key={v}
                onClick={() => updateSettings({ theme: v as Theme })}
                aria-checked={s.theme === v}
                className={cn('pressable flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium', s.theme === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="size-3.5" /> {l}
              </button>
            ))}
          </div>
        </Row>
      </Card>
    </Section>
  )
}

// ------------------------------------------------------------------ notifications

function NotificationsSection() {
  const { data, updateSettings } = useStore()
  const n = data.settings.notifications
  const set = (patch: Partial<typeof n>) => updateSettings({ notifications: { ...n, ...patch } })
  return (
    <Section id="notifications" title="Notifications" description="Alerts shown in the bell menu at the top of every page.">
      <Card>
        <Row inline label="Payment reminders" hint="Upcoming bills, debt repayments and planned payments.">
          <Switch checked={n.enabled} onCheckedChange={(c) => set({ enabled: c })} aria-label="Payment reminders" />
        </Row>
        <Row label="Remind me" hint="How far ahead reminders start." className={cn('sm:pl-10', !n.enabled && 'opacity-50')}>
          <Select value={String(n.upcomingDays)} onValueChange={(v) => set({ upcomingDays: Number(v) })} disabled={!n.enabled}>
            <SelectTrigger className="w-full sm:w-36" size="sm" aria-label="Reminder days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 3, 5, 7, 14, 30].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} day{d > 1 ? 's' : ''} before
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row inline label="Overdue payments" hint="Planned items that are past their date.">
          <Switch checked={n.overdue} onCheckedChange={(c) => set({ overdue: c })} aria-label="Overdue payments" />
        </Row>
        <Row inline label="Budget warnings" hint={`When a category reaches ${data.settings.budgetWarnPct}% and when it goes over.`}>
          <Switch checked={n.budget} onCheckedChange={(c) => set({ budget: c })} aria-label="Budget warnings" />
        </Row>
        <Row inline label="Low balance forecast" hint="When your forecast drops below zero.">
          <Switch checked={n.lowBalance} onCheckedChange={(c) => set({ lowBalance: c })} aria-label="Low balance forecast" />
        </Row>
      </Card>
    </Section>
  )
}

// ------------------------------------------------------------------ money accounts

function MoneyAccountsSection() {
  const { data, addAccount, updateAccount, deleteAccount } = useStore()
  const [name, setName] = useState('')
  const [open, setOpen] = useState('')
  const used = (id: string) => data.transactions.some((t) => t.accountId === id || t.toAccountId === id)
  const cols = 'grid grid-cols-[minmax(0,1fr)_110px_32px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_140px_130px_32px] sm:gap-3'
  return (
    <Section id="accounts" title="Money accounts" description="Where your money is kept — e.g. bank, cash, wallet. The opening balance is what the account held before you started tracking.">
      <Card>
        <div className={cn(cols, 'px-4 py-2 text-xs font-medium text-muted-foreground sm:px-5')}>
          <span>Account</span>
          <span>Opening balance</span>
          <span className="hidden text-right sm:block">Balance now</span>
          <span />
        </div>
        {data.accounts.map((a) => {
          const removable = data.accounts.length > 1 && !used(a.id)
          return (
            <div key={a.id} className={cn(cols, 'px-4 py-2.5 sm:px-5')}>
              <Input defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && updateAccount(a.id, { name: e.target.value.trim() })} aria-label="Account name" />
              <Input
                defaultValue={String(a.openingBalance)}
                inputMode="decimal"
                className="tabular"
                aria-label={`${a.name} opening balance`}
                onBlur={(e) => {
                  const v = parseAmount(e.target.value || '0')
                  if (!Number.isFinite(v)) return toast.error('Opening balance must be a number')
                  if (v !== a.openingBalance) updateAccount(a.id, { openingBalance: v })
                }}
              />
              <span className="hidden text-right text-sm font-medium tabular sm:block">{money(accountBalance(data, a.id))}</span>
              {removable ? (
                <Button variant="ghost" size="icon" aria-label={`Remove ${a.name}`} onClick={() => deleteAccount(a.id)}>
                  <X />
                </Button>
              ) : (
                <span title={data.accounts.length > 1 ? 'Has transactions — can’t be removed' : 'You need at least one account'} />
              )}
            </div>
          )
        })}
        <form
          className={cn(cols, 'bg-muted/30 px-4 py-2.5 sm:px-5')}
          onSubmit={(e) => {
            e.preventDefault()
            const v = open ? parseAmount(open) : 0
            if (!name.trim()) return toast.error('Name the account')
            if (!Number.isFinite(v)) return toast.error('Opening balance must be a number')
            addAccount({ name: name.trim(), openingBalance: v })
            setName('')
            setOpen('')
            toast.success('Account added')
          }}
        >
          <Input placeholder="Add an account (e.g. Savings, Cash)" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="New account name" />
          <Input placeholder="0" inputMode="decimal" value={open} onChange={(e) => setOpen(e.target.value)} aria-label="New account opening balance" />
          <span className="hidden sm:block" />
          <Button type="submit" variant="outline" size="icon" aria-label="Add account" disabled={!name.trim()}>
            <Plus />
          </Button>
        </form>
      </Card>
    </Section>
  )
}

// ------------------------------------------------------------------ goals

function GoalsSection() {
  const { data } = useStore()
  const s = data.settings
  return (
    <Section id="goals" title="Budget & goals" description="Shortcuts to where these are managed.">
      <Card>
        <LinkRow label="Monthly budget" value={s.monthlyBudget ? `${money(s.monthlyBudget)} · warn at ${s.budgetWarnPct}%` : 'Sum of category limits'} onClick={() => go('budget')} />
        <LinkRow label="Savings goals" value={data.goals.length ? `${data.goals.length} active` : 'None yet'} onClick={() => go('savings')} />
        <LinkRow label="Debt payoff goal" value={data.debtGoal ? `${data.debtGoal.title} · ${fmt(data.debtGoal.targetDate, 'd MMM yyyy')}` : 'Not set'} onClick={() => go('debts')} />
      </Card>
    </Section>
  )
}

// ------------------------------------------------------------------ categories

function CategoriesSection() {
  return (
    <Section id="categories" title="Categories" description="Used to group your transactions and budgets. Categories that are in use can't be removed.">
      <Card>
        <CategoryEditor type="expense" />
        <CategoryEditor type="income" />
      </Card>
    </Section>
  )
}

function CategoryEditor({ type }: { type: 'income' | 'expense' }) {
  const { data, addCategory, removeCategory } = useStore()
  const list = type === 'income' ? data.settings.incomeCategories : data.settings.expenseCategories
  const [v, setV] = useState('')
  const inUse = (c: string) => data.transactions.some((t) => t.category === c)
  return (
    <div className="grid gap-3 px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{type === 'income' ? 'Income' : 'Expenses'}</h3>
        <span className="text-xs text-muted-foreground">{list.length} categories</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => {
          const locked = inUse(c) || list.length <= 1
          return (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-xs">
              {c}
              <button
                type="button"
                disabled={locked}
                onClick={() => removeCategory(type, c)}
                aria-label={`Remove ${c}`}
                title={inUse(c) ? 'In use by transactions' : 'Remove'}
                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <X className="size-3" />
              </button>
            </span>
          )
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const nme = v.trim()
          if (!nme) return
          if (list.some((c) => c.toLowerCase() === nme.toLowerCase())) return void toast.error('That category already exists')
          addCategory(type, nme)
          setV('')
        }}
      >
        <Input placeholder={`New ${type} category`} value={v} onChange={(e) => setV(e.target.value)} maxLength={30} className="sm:max-w-xs" aria-label={`New ${type} category`} />
        <Button type="submit" variant="outline" disabled={!v.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  )
}

// ------------------------------------------------------------------ data

function DataSection() {
  const { data, replaceAll, resetDemo, startFresh } = useStore()
  const { demo } = useCloud()
  const ref = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<AppData | null>(null)
  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const parsed = JSON.parse(await f.text())
      if (!isAppData(parsed)) throw new Error('This file is not a My Ullu backup')
      setPending(parsed)
    } catch (e) {
      toast.error(`Couldn't restore: ${(e as Error).message}`)
    } finally {
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <Section id="data" title="Data & backup" description="Take your data with you, or restore it from a backup.">
      <div className="grid gap-4">
        <Card>
          <Row inline label="Export transactions" hint="A spreadsheet (CSV) of all your personal transactions.">
            <Button variant="outline" size="sm" onClick={() => exportCsv(data.transactions.filter((t) => !t.onHold), data)}>
              <Download /> Export CSV
            </Button>
          </Row>
          <Row inline label="Download a backup" hint="Everything — accounts, debts, bills, goals and settings — in one file.">
            <Button variant="outline" size="sm" onClick={() => exportJson(data)}>
              <FileJson /> Download
            </Button>
          </Row>
          <Row inline label="Restore from a backup" hint="Replaces your current data with a backup file.">
            <input ref={ref} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
              <Upload /> Choose file…
            </Button>
          </Row>
          {pending && (
            <div className="bg-upcoming-soft px-4 py-3.5 text-sm sm:px-5">
              <div className="font-medium">Replace your current data with this backup?</div>
              <p className="text-xs text-muted-foreground">
                It has {pending.transactions.length} transactions, {pending.debts.length} debts, {pending.bills.length} bills and {pending.goals.length} goals.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    replaceAll(pending)
                    setPending(null)
                    toast.success('Backup restored')
                  }}
                >
                  Restore
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-expense/25">
          <div className="px-4 py-2.5 text-xs font-semibold tracking-wide text-expense uppercase sm:px-5">Danger zone</div>
          {demo && (
            <Row inline label="Start the demo over" hint="Discards your changes and reloads the sample data.">
              <Confirm
                trigger={
                  <Button variant="outline" size="sm">
                    <RotateCcw /> Reset demo
                  </Button>
                }
                title="Start the demo over?"
                description="All changes you made in the demo are discarded and the sample data is reloaded."
                confirmLabel="Reset demo"
                onConfirm={() => {
                  resetDemo()
                  toast('Demo data restored')
                }}
              />
            </Row>
          )}
          <Row inline label="Erase all personal data" hint="Deletes transactions, debts, bills, income and goals. Settings are kept. Group data isn't affected.">
            <Confirm
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 /> Erase everything
                </Button>
              }
              title="Erase all data?"
              description="All transactions, debts, bills, income and goals are deleted. Your settings are kept. This can't be undone unless you have a backup."
              confirmLabel="Erase all"
              onConfirm={() => {
                startFresh()
                toast('All data erased')
              }}
            />
          </Row>
        </div>
      </div>
    </Section>
  )
}
