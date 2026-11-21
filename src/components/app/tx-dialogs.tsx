import { createContext, useContext, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveModal } from './responsive-modal'
import { Confirm } from './confirm'
import { Field } from './page'
import { KIND_STYLE } from './badges'
import { useStore, type NewTx } from '@/lib/store'
import { debtStats, goalStats } from '@/lib/finance'
import { currencySymbol, fmtDate, money, parseAmount, todayISO } from '@/lib/format'
import { go } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { Transaction, TxKind, TxStatus } from '@/lib/types'
import { KIND_LABEL, STATUS_LABEL } from '@/lib/types'

type Ctx = {
  openNew: (defaults?: Partial<NewTx>) => void
  openEdit: (tx: Transaction) => void
  openComplete: (tx: Transaction) => void
}
const TxCtx = createContext<Ctx | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useTx() {
  const c = useContext(TxCtx)
  if (!c) throw new Error('useTx outside provider')
  return c
}

export const QUICK_ACTIONS: { kind: TxKind; label: string }[] = [
  { kind: 'income', label: 'Add income' },
  { kind: 'expense', label: 'Add expense' },
  { kind: 'transfer', label: 'Transfer money' },
  { kind: 'debt_payment', label: 'Add debt payment' },
  { kind: 'savings', label: 'Add savings' },
]

export function TxProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<{ tx?: Transaction; defaults?: Partial<NewTx>; key: number } | null>(null)
  const [done, setDone] = useState<Transaction | null>(null)
  const value: Ctx = {
    openNew: (defaults) => setForm({ defaults, key: Date.now() }),
    openEdit: (tx) => setForm({ tx, key: Date.now() }),
    openComplete: (tx) => setDone(tx),
  }
  const k = form?.tx?.kind ?? form?.defaults?.kind ?? 'expense'
  return (
    <TxCtx.Provider value={value}>
      {children}
      <ResponsiveModal
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.tx ? 'Edit transaction' : QUICK_ACTIONS.find((q) => q.kind === k)?.label ?? 'New transaction'}
        description={form?.tx ? 'Balances and forecasts update as soon as you save.' : 'Only completed transactions change your balance.'}
      >
        {form && (
          <TxForm
            key={form.key}
            tx={form.tx}
            defaults={form.defaults}
            onDone={() => setForm(null)}
            onComplete={(t) => {
              setForm(null)
              setDone(t)
            }}
          />
        )}
      </ResponsiveModal>
      <ResponsiveModal open={!!done} onOpenChange={(o) => !o && setDone(null)} title={done?.kind === 'income' ? 'Mark as received' : 'Mark as completed'} description={done?.title}>
        {done && <CompleteForm key={done.id} tx={done} onDone={() => setDone(null)} />}
      </ResponsiveModal>
    </TxCtx.Provider>
  )
}

// ------------------------------------------------------------------ form

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="grid gap-1 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }} role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'pressable rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function AmountInput({ value, onChange, error, autoFocus }: { value: string; onChange: (v: string) => void; error?: string; autoFocus?: boolean }) {
  const n = parseAmount(value)
  return (
    <Field label="Amount" error={error} hint={value && Number.isFinite(n) ? money(n) : undefined}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol()}</span>
        <Input
          inputMode="decimal"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className="h-12 pl-10 text-xl font-semibold tabular"
          placeholder="0"
          aria-invalid={!!error}
        />
      </div>
    </Field>
  )
}

const KINDS: TxKind[] = ['income', 'expense', 'transfer', 'debt_payment', 'savings', 'bill_payment']
const SHORT: Record<TxKind, string> = { income: 'Income', expense: 'Expense', transfer: 'Transfer', debt_payment: 'Debt', savings: 'Savings', bill_payment: 'Bill' }

function TxForm({ tx, defaults, onDone, onComplete }: { tx?: Transaction; defaults?: Partial<NewTx>; onDone: () => void; onComplete: (t: Transaction) => void }) {
  const { data, addTx, updateTx, deleteTx, addCategory } = useStore()
  const s = data.settings
  const init: NewTx = {
    date: todayISO(),
    title: '',
    amount: 0,
    kind: 'expense',
    category: s.expenseCategories[0] ?? 'Other',
    status: 'completed',
    accountId: data.accounts[0]?.id ?? '',
    ...defaults,
    ...(tx ?? {}),
  }
  if (!tx && defaults?.kind === 'income' && !defaults.category) init.category = s.incomeCategories[0] ?? 'Other'
  const [v, setV] = useState<NewTx>(init)
  const [amt, setAmt] = useState(init.amount ? String(init.amount) : '')
  const [err, setErr] = useState<Record<string, string>>({})
  const [newCat, setNewCat] = useState<string | null>(null)
  const set = <K extends keyof NewTx>(k: K, val: NewTx[K]) => setV((p) => ({ ...p, [k]: val }))

  const setKind = (kind: TxKind) =>
    setV((p) => ({
      ...p,
      kind,
      category:
        kind === 'income' ? (s.incomeCategories.includes(p.category) ? p.category : s.incomeCategories[0] ?? 'Other')
        : kind === 'expense' || kind === 'bill_payment' ? (s.expenseCategories.includes(p.category) ? p.category : s.expenseCategories[0] ?? 'Other')
        : kind === 'debt_payment' ? 'Debt'
        : kind === 'savings' ? 'Savings'
        : 'Transfer',
      debtId: kind === 'debt_payment' ? p.debtId : undefined,
      goalId: kind === 'savings' ? p.goalId : undefined,
      toAccountId: kind === 'transfer' ? p.toAccountId ?? data.accounts.find((a) => a.id !== p.accountId)?.id : undefined,
      reserved: kind === 'income' ? undefined : p.reserved,
    }))

  const debt = data.debts.find((x) => x.id === v.debtId)
  const ds = debt ? debtStats(data, debt) : undefined
  const outflow = v.kind !== 'income' && v.kind !== 'transfer'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseAmount(amt)
    const er: Record<string, string> = {}
    if (!amt.trim()) er.amount = 'Enter an amount'
    else if (!Number.isFinite(n)) er.amount = 'Use numbers only, e.g. 15000 or 15,000.50'
    else if (n <= 0) er.amount = 'Amount must be more than zero'
    else if (n > 1e11) er.amount = 'That amount is too large'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) er.date = 'Pick a date'
    if (!v.accountId) er.accountId = 'Choose an account'
    if (v.kind === 'transfer') {
      if (!v.toAccountId) er.toAccountId = 'Choose where the money goes'
      else if (v.toAccountId === v.accountId) er.toAccountId = 'Pick a different account'
    }
    if (v.kind === 'debt_payment' && !v.debtId) er.debtId = 'Choose which debt this pays'
    if (v.kind === 'debt_payment' && ds && v.status === 'completed' && Number.isFinite(n)) {
      const already = tx?.status === 'completed' && tx.debtId === v.debtId ? tx.amount : 0
      if (n > ds.outstanding + already) er.amount = `Only ${money(ds.outstanding + already)} is outstanding`
    }
    if (v.kind === 'savings' && !v.goalId) er.goalId = 'Choose a savings goal'
    setErr(er)
    if (Object.keys(er).length) return
    const goal = data.goals.find((g) => g.id === v.goalId)
    const toAcc = data.accounts.find((a) => a.id === v.toAccountId)
    const title =
      v.title.trim() ||
      (v.kind === 'debt_payment' && debt ? `${debt.name} — repayment` : v.kind === 'savings' && goal ? `Saving for ${goal.name}` : v.kind === 'transfer' && toAcc ? `Transfer to ${toAcc.name}` : v.category)
    const payload: NewTx = { ...v, title, amount: n, reserved: v.status === 'planned' && outflow ? v.reserved : undefined }
    if (tx) {
      updateTx(tx.id, payload)
      toast.success('Saved')
    } else {
      addTx(payload)
      toast.success(payload.status === 'completed' ? `${KIND_LABEL[payload.kind]} of ${money(n)} recorded` : `Planned for ${fmtDate(payload.date)}`)
    }
    onDone()
  }

  const cats = v.kind === 'income' ? s.incomeCategories : s.expenseCategories
  const statuses: TxStatus[] = ['completed', 'planned', 'cancelled']

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      {!tx?.billId && (
        <div className="grid grid-cols-5 gap-1.5">
          {KINDS.filter((k) => k !== 'bill_payment').map((k) => {
            const st = KIND_STYLE[k]
            const Icon = st.icon
            return (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={v.kind === k}
                className={cn('pressable flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium', v.kind === k ? cn('border-transparent', st.chip) : 'text-muted-foreground hover:bg-muted')}
              >
                <Icon className="size-4" />
                {SHORT[k]}
              </button>
            )
          })}
        </div>
      )}

      <AmountInput value={amt} onChange={setAmt} error={err.amount} autoFocus={!tx} />

      {v.kind === 'debt_payment' && (
        <Field label="Debt" error={err.debtId}>
          {data.debts.length ? (
            <Select value={v.debtId ?? ''} onValueChange={(id) => set('debtId', id)}>
              <SelectTrigger className="w-full" aria-invalid={!!err.debtId}>
                <SelectValue placeholder="Choose a debt" />
              </SelectTrigger>
              <SelectContent>
                {data.debts.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name} · {money(debtStats(data, x).outstanding)} left
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <EmptyLink text="No debts yet." action="Add a debt" onClick={() => { onDone(); go('debts') }} />
          )}
        </Field>
      )}

      {v.kind === 'savings' && (
        <Field label="Savings goal" error={err.goalId}>
          {data.goals.length ? (
            <Select value={v.goalId ?? ''} onValueChange={(id) => set('goalId', id)}>
              <SelectTrigger className="w-full" aria-invalid={!!err.goalId}>
                <SelectValue placeholder="Choose a goal" />
              </SelectTrigger>
              <SelectContent>
                {data.goals.map((g) => {
                  const gs = goalStats(data, g)
                  return (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} · {money(gs.saved)} of {money(g.target)}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          ) : (
            <EmptyLink text="No savings goals yet." action="Create one" onClick={() => { onDone(); go('savings') }} />
          )}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={err.date}>
          <Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} aria-invalid={!!err.date} />
        </Field>
        {v.kind === 'income' || v.kind === 'expense' || v.kind === 'bill_payment' ? (
          <Field label="Category">
            <Select
              value={v.category}
              onValueChange={(c) => (c === '__new' ? setNewCat('') : set('category', c))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([...cats, v.category])).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value="__new">+ New category…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : v.kind === 'transfer' ? (
          <Field label="To account" error={err.toAccountId}>
            <Select value={v.toAccountId ?? ''} onValueChange={(id) => set('toAccountId', id)}>
              <SelectTrigger className="w-full" aria-invalid={!!err.toAccountId}>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {data.accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === v.accountId}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Account">
            <AccountSelect value={v.accountId} onChange={(id) => set('accountId', id)} />
          </Field>
        )}
      </div>

      {newCat !== null && (
        <div className="flex gap-2">
          <Input autoFocus placeholder="Category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={30} />
          <Button
            type="button"
            variant="outline"
            disabled={!newCat.trim()}
            onClick={() => {
              addCategory(v.kind === 'income' ? 'income' : 'expense', newCat.trim())
              set('category', newCat.trim())
              setNewCat(null)
            }}
          >
            Add
          </Button>
        </div>
      )}

      {(v.kind === 'transfer' || ((v.kind === 'income' || v.kind === 'expense' || v.kind === 'bill_payment') && data.accounts.length > 1)) && (
        <Field label={v.kind === 'transfer' ? 'From account' : 'Account'} error={err.accountId}>
          <AccountSelect value={v.accountId} onChange={(id) => set('accountId', id)} />
        </Field>
      )}
      {v.kind === 'transfer' && data.accounts.length < 2 && (
        <EmptyLink text="Transfers need at least two accounts." action="Add an account" onClick={() => { onDone(); go('settings') }} />
      )}

      <Field label="Description">
        <Input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder={v.kind === 'expense' ? 'e.g. Groceries' : 'Optional'} maxLength={80} />
      </Field>

      <Field
        label="Status"
        hint={
          v.status === 'completed'
            ? v.kind === 'income' ? 'Received — added to your balance.' : 'Done — counted in your balance.'
            : v.status === 'planned'
              ? 'Planned — shows in forecasts only. Your balance is unchanged.'
              : 'Cancelled — kept for history, ignored everywhere.'
        }
      >
        <Segmented value={v.status} onChange={(x) => set('status', x)} options={statuses.map((x) => ({ value: x, label: STATUS_LABEL[x] }))} />
      </Field>

      {(v.status === 'planned' && outflow) || v.kind === 'expense' || v.kind === 'bill_payment' ? (
        <div className="grid gap-3 rounded-xl border p-3">
          {v.status === 'planned' && outflow && (
            <ToggleRow label="Reserve the cash" hint="Set money aside now so it isn't counted as available." checked={!!v.reserved} onChange={(c) => set('reserved', c || undefined)} />
          )}
          {v.status === 'planned' && v.kind === 'expense' && (
            <ToggleRow label="Optional" hint="May not happen — can be left out of forecasts." checked={!!v.optional} onChange={(c) => set('optional', c || undefined)} />
          )}
          {(v.kind === 'expense' || v.kind === 'bill_payment') && (
            <ToggleRow label="Paid from outside" hint="Funded from money you don't track here. Doesn't change your balance." checked={!!v.external} onChange={(c) => set('external', c || undefined)} />
          )}
        </div>
      ) : null}

      <Field label="Notes">
        <Textarea rows={2} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} maxLength={300} />
      </Field>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {tx && (
          <Confirm
            trigger={
              <Button type="button" variant="destructive" size="icon-lg" aria-label="Delete transaction">
                <Trash2 />
              </Button>
            }
            title="Delete this transaction?"
            description={`"${tx.title}" (${money(tx.amount)}) will be removed for good, and balances will be recalculated.`}
            onConfirm={() => {
              deleteTx(tx.id)
              toast('Transaction deleted')
              onDone()
            }}
          />
        )}
        {tx?.status === 'planned' && (
          <Button type="button" variant="outline" size="lg" onClick={() => onComplete(tx)}>
            {tx.kind === 'income' ? 'Mark received…' : 'Mark completed…'}
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {tx ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

function AccountSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useStore()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {data.accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (c: boolean) => void }) {
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

function EmptyLink({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
      {text}{' '}
      <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={onClick}>
        {action}
      </button>
    </p>
  )
}

// ------------------------------------------------------------------ complete

function CompleteForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const { data, complete } = useStore()
  const [amt, setAmt] = useState(String(tx.amount))
  const [date, setDate] = useState(todayISO())
  const [keep, setKeep] = useState(tx.kind === 'debt_payment')
  const [err, setErr] = useState('')
  const n = parseAmount(amt)
  const partial = Number.isFinite(n) && n > 0 && n < tx.amount
  const debt = data.debts.find((x) => x.id === tx.debtId)
  const outstanding = debt ? debtStats(data, debt).outstanding : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!Number.isFinite(n) || n <= 0) return setErr('Enter the amount actually paid')
    if (outstanding !== undefined && n > outstanding) return setErr(`Only ${money(outstanding)} is outstanding to ${debt!.name}`)
    if (!date) return setErr('Pick a date')
    complete(tx.id, { amount: n, date, keepRemainder: partial && keep })
    toast.success(`${tx.title} — ${money(n)} ${tx.kind === 'income' ? 'received' : 'completed'}`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        Planned <b className="tabular">{money(tx.amount)}</b> on {fmtDate(tx.date)}
        {outstanding !== undefined && <span className="block text-xs text-muted-foreground">{money(outstanding)} owed to {debt!.name} before this payment</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx.kind === 'income' ? 'Amount received' : 'Amount paid'}>
          <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.,]/g, ''))} className="tabular" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {partial && tx.kind !== 'income' && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={keep} onCheckedChange={(c) => setKeep(!!c)} className="mt-0.5" />
          <span>
            Keep the remaining <b className="tabular">{money(tx.amount - n)}</b> as a planned payment
            <span className="block text-xs text-muted-foreground">Otherwise this is recorded as a partial payment only.</span>
          </span>
        </label>
      )}
      {err && <p className="text-xs text-expense">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="bg-income text-white hover:bg-income/90">
          Confirm
        </Button>
      </div>
    </form>
  )
}
