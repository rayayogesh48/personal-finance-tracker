import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileJson, Monitor, Moon, Plus, RotateCcw, Sun, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, PageHeader, Panel } from '@/components/app/page'
import { Confirm } from '@/components/app/confirm'
import { AccountPanel } from '@/components/app/cloud-ui'
import { useStore, isAppData } from '@/lib/store'
import { useAuth } from '@/lib/auth'
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

export function SettingsPage() {
  const { data, updateSettings } = useStore()
  const s = data.settings
  const [name, setName] = useState(s.name)

  return (
    <div>
      <PageHeader title="Settings" description="Your data is stored in this browser, and in your private cloud account when you sign in." />
      <div className="grid gap-5 lg:grid-cols-2">
        <AccountPanel />
        <Panel title="Profile & display">
          <div className="grid gap-4">
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.name && updateSettings({ name: name.trim() })} maxLength={30} placeholder="Used in greetings" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <Select value={s.currency} onValueChange={(v) => updateSettings({ currency: v as Currency })}>
                  <SelectTrigger className="w-full">
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
              </Field>
              <Field label="Date format">
                <Select value={s.dateFormat} onValueChange={(v) => updateSettings({ dateFormat: v as DateFormat })}>
                  <SelectTrigger className="w-full">
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
              </Field>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Changing currency only changes how amounts are shown — it doesn't convert them.</p>
            <Field label="Theme">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                {(
                  [
                    ['light', 'Light', Sun],
                    ['dark', 'Dark', Moon],
                    ['system', 'System', Monitor],
                  ] as const
                ).map(([v, l, Icon]) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => updateSettings({ theme: v as Theme })}
                    aria-pressed={s.theme === v}
                    className={cn('pressable flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium', s.theme === v ? 'bg-card shadow-sm' : 'text-muted-foreground')}
                  >
                    <Icon className="size-3.5" /> {l}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Panel>

        <Panel title="Notifications" description="Shown in the bell menu at the top of every page.">
          <div className="grid gap-3">
            <Toggle label="Payment reminders" hint="Upcoming bills, debts and planned payments" checked={s.notifications.enabled} onChange={(c) => updateSettings({ notifications: { ...s.notifications, enabled: c } })} />
            <div className={cn('flex items-center justify-between gap-3 text-sm', !s.notifications.enabled && 'opacity-50')}>
              <span>Remind me this many days ahead</span>
              <Select value={String(s.notifications.upcomingDays)} onValueChange={(v) => updateSettings({ notifications: { ...s.notifications, upcomingDays: Number(v) } })} disabled={!s.notifications.enabled}>
                <SelectTrigger className="w-24" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 3, 5, 7, 14, 30].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} day{n > 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Toggle label="Overdue payments" hint="Planned items past their date" checked={s.notifications.overdue} onChange={(c) => updateSettings({ notifications: { ...s.notifications, overdue: c } })} />
            <Toggle label="Budget warnings" hint={`At ${s.budgetWarnPct}% and when over`} checked={s.notifications.budget} onChange={(c) => updateSettings({ notifications: { ...s.notifications, budget: c } })} />
            <Toggle label="Low balance forecast" hint="When your forecast drops below zero" checked={s.notifications.lowBalance} onChange={(c) => updateSettings({ notifications: { ...s.notifications, lowBalance: c } })} />
          </div>
        </Panel>

        <AccountsPanel />

        <Panel title="Budget & goals">
          <div className="grid gap-3 text-sm">
            <Row label="Monthly budget" value={s.monthlyBudget ? money(s.monthlyBudget) : 'Sum of categories'} onClick={() => go('budget')} />
            <Row label="Savings goals" value={`${data.goals.length} active`} onClick={() => go('savings')} />
            <Row label="Debt payoff goal" value={data.debtGoal ? `${data.debtGoal.title} · ${fmt(data.debtGoal.targetDate, 'd MMM yyyy')}` : 'Not set'} onClick={() => go('debts')} />
          </div>
        </Panel>

        <CategoriesPanel type="expense" />
        <CategoriesPanel type="income" />

        <DataPanel />
      </div>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/50">
      <span>{label}</span>
      <span className="text-muted-foreground">{value} →</span>
    </button>
  )
}

function AccountsPanel() {
  const { data, addAccount, updateAccount, deleteAccount } = useStore()
  const [name, setName] = useState('')
  const [open, setOpen] = useState('')
  const used = (id: string) => data.transactions.some((t) => t.accountId === id || t.toAccountId === id)
  return (
    <Panel title="Accounts" description="Opening balance = money in the account before you started tracking.">
      <div className="grid gap-2">
        {data.accounts.map((a) => (
          <div key={a.id} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
            <Input defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && updateAccount(a.id, { name: e.target.value.trim() })} aria-label="Account name" />
            <Input
              defaultValue={String(a.openingBalance)}
              inputMode="decimal"
              className="tabular"
              aria-label={`${a.name} opening balance`}
              onBlur={(e) => {
                const n = parseAmount(e.target.value || '0')
                if (!Number.isFinite(n)) return toast.error('Opening balance must be a number')
                if (n !== a.openingBalance) updateAccount(a.id, { openingBalance: n })
              }}
            />
            {data.accounts.length > 1 && !used(a.id) ? (
              <Button variant="ghost" size="icon" aria-label={`Remove ${a.name}`} onClick={() => deleteAccount(a.id)}>
                <X />
              </Button>
            ) : (
              <span className="w-8 text-right text-[11px] text-muted-foreground tabular" title="Current balance">
                {money(accountBalance(data, a.id)).replace(/\s/, ' ')}
              </span>
            )}
          </div>
        ))}
        <form
          className="mt-2 grid grid-cols-[1fr_120px_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = open ? parseAmount(open) : 0
            if (!name.trim()) return toast.error('Name the account')
            if (!Number.isFinite(n)) return toast.error('Opening balance must be a number')
            addAccount({ name: name.trim(), openingBalance: n })
            setName('')
            setOpen('')
          }}
        >
          <Input placeholder="New account (e.g. Savings)" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
          <Input placeholder="Opening" inputMode="decimal" value={open} onChange={(e) => setOpen(e.target.value)} />
          <Button type="submit" variant="outline" size="icon" aria-label="Add account">
            <Plus />
          </Button>
        </form>
      </div>
    </Panel>
  )
}

function CategoriesPanel({ type }: { type: 'income' | 'expense' }) {
  const { data, addCategory, removeCategory } = useStore()
  const list = type === 'income' ? data.settings.incomeCategories : data.settings.expenseCategories
  const [v, setV] = useState('')
  const inUse = (c: string) => data.transactions.some((t) => t.category === c)
  return (
    <Panel title={type === 'income' ? 'Income categories' : 'Expense categories'}>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-xs">
            {c}
            <button
              type="button"
              disabled={inUse(c) || list.length <= 1}
              onClick={() => removeCategory(type, c)}
              aria-label={`Remove ${c}`}
              title={inUse(c) ? 'In use by transactions' : 'Remove'}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const n = v.trim()
          if (!n) return
          if (list.some((c) => c.toLowerCase() === n.toLowerCase())) return void toast.error('Already exists')
          addCategory(type, n)
          setV('')
        }}
      >
        <Input placeholder="Add category" value={v} onChange={(e) => setV(e.target.value)} maxLength={30} />
        <Button type="submit" variant="outline" disabled={!v.trim()}>
          Add
        </Button>
      </form>
    </Panel>
  )
}

function DataPanel() {
  const { data, replaceAll, resetDemo, startFresh } = useStore()
  const { demo } = useAuth()
  const ref = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<AppData | null>(null)
  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const parsed = JSON.parse(await f.text())
      if (!isAppData(parsed)) throw new Error('This file is not a PocketLedger backup')
      setPending(parsed)
    } catch (e) {
      toast.error(`Couldn't restore: ${(e as Error).message}`)
    } finally {
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <Panel title="Your data" className="lg:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Button variant="outline" className="justify-start" onClick={() => exportCsv(data.transactions.filter((t) => !t.onHold), data)}>
          <Download /> Export transactions (CSV)
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => exportJson(data)}>
          <FileJson /> Download backup (JSON)
        </Button>
        <input ref={ref} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outline" className="justify-start" onClick={() => ref.current?.click()}>
          <Upload /> Restore from backup…
        </Button>
        {demo && <Confirm
          trigger={
            <Button variant="outline" className="justify-start">
              <RotateCcw /> Reset demo data
            </Button>
          }
          title="Start the demo over?"
          description="All changes you made in the demo are discarded and the sample data is reloaded."
          confirmLabel="Reset to demo"
          onConfirm={() => {
            resetDemo()
            toast('Demo data restored')
          }}
        />}
        <Confirm
          trigger={
            <Button variant="destructive" className="justify-start">
              <Trash2 /> Erase everything & start fresh
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
      </div>
      {pending && (
        <div className="mt-4 rounded-xl border bg-upcoming-soft p-3 text-sm">
          <div className="font-medium">Replace your current data with this backup?</div>
          <p className="text-xs text-muted-foreground">
            It contains {pending.transactions.length} transactions, {pending.debts.length} debts, {pending.bills.length} bills and {pending.goals.length} goals.
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
    </Panel>
  )
}
