import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Flag, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bar, Empty, Field, PageHeader, Panel, Stat } from '@/components/app/page'
import { ResponsiveModal } from '@/components/app/responsive-modal'
import { Confirm } from '@/components/app/confirm'
import { TxRow } from '@/components/app/tx-row'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { debtGoalProgress, debtSummary, type DebtStats, type DebtStatus } from '@/lib/finance'
import { fmt, fmtDate, money, parseAmount, relDays, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Debt, DebtGoal, Frequency } from '@/lib/types'
import { FREQ_LABEL } from '@/lib/types'

const STATUS: Record<DebtStatus, { label: string; cls: string }> = {
  'paid-off': { label: 'Paid off', cls: 'bg-income-soft text-income' },
  'in-progress': { label: 'Repaying', cls: 'bg-upcoming-soft text-upcoming' },
  'not-started': { label: 'Not started', cls: 'bg-muted text-muted-foreground' },
  overdue: { label: 'Payment overdue', cls: 'bg-overdue-soft text-overdue' },
}

export function DebtsPage() {
  const { data } = useStore()
  const sum = debtSummary(data)
  const [edit, setEdit] = useState<Debt | 'new' | null>(null)
  const [goalEdit, setGoalEdit] = useState(false)

  return (
    <div>
      <PageHeader
        title="Debts & loans"
        description="Balances go down only when a repayment is marked completed."
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus /> Add debt
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total debt" value={money(sum.total)} hint={`${data.debts.length} debt${data.debts.length === 1 ? '' : 's'}`} />
        <Stat label="Repaid" value={money(sum.repaid)} tone="income" hint={<Bar value={sum.pct} className="mt-1.5" />} />
        <Stat label="Remaining" value={money(sum.remaining)} tone="debt" hint={`${Math.round(sum.pct * 100)}% repaid`} />
        <Stat label="Upcoming repayments" value={money(sum.upcoming.reduce((a, t) => a + t.amount, 0))} tone="upcoming" hint={sum.upcoming[0] ? `Next ${fmtDate(sum.upcoming[0].date)}` : 'None planned'} />
      </div>

      <DebtGoalPanel onEdit={() => setGoalEdit(true)} />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {sum.stats.map((s) => (
          <DebtCard key={s.debt.id} s={s} onEdit={() => setEdit(s.debt)} />
        ))}
        {!data.debts.length && <Empty>No debts tracked. Add one to follow repayments.</Empty>}
      </div>

      <ResponsiveModal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add debt' : 'Edit debt'}>
        {edit && <DebtForm debt={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </ResponsiveModal>
      <ResponsiveModal open={goalEdit} onOpenChange={setGoalEdit} title="Debt payoff goal" description="Repayments planned on or before the target date count toward this goal. Anything later is tracked separately.">
        {goalEdit && <GoalForm onDone={() => setGoalEdit(false)} />}
      </ResponsiveModal>
    </div>
  )
}

function DebtGoalPanel({ onEdit }: { onEdit: () => void }) {
  const { data } = useStore()
  const g = debtGoalProgress(data)
  if (!g)
    return (
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">Set a target date to become free of your most important debts.</div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Flag /> Set payoff goal
          </Button>
        </div>
      </Panel>
    )
  const label = g.fullyFree ? 'All debts repaid' : g.priorityDone ? 'Target met — later debts remain' : g.affordable ? 'On track' : 'Cash shortfall before target'
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Flag className="size-4 text-debt" /> {g.goal.title}
        </span>
      }
      description={`By ${fmtDate(g.goal.targetDate)} · ${g.daysLeft > 0 ? `${g.daysLeft} days left` : g.daysLeft === 0 ? 'today' : 'target date passed'}`}
      action={
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular">{Math.round(g.pct * 100)}%</span>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', g.priorityDone || g.affordable ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense')}>{label}</span>
          </div>
          <Bar value={g.pct} tone="debt" className="h-2.5" />
          <p className="mt-2 text-xs text-muted-foreground">
            {money(g.repaid)} repaid of {money(g.priorityTotal)} due by the target. Forecast balance on the target date: <b className={cn('tabular', g.balanceAtTarget < 0 && 'text-expense')}>{money(g.balanceAtTarget)}</b>.
          </p>
          {!g.affordable && <p className="mt-2 rounded-xl bg-expense-soft p-2.5 text-xs text-expense">Your forecast dips to {money(g.minBefore)} before the target. Move a payment later or reduce planned spending.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-debt-soft p-3">
            <div className="text-xs text-debt">Due by target</div>
            <div className="text-lg font-semibold tabular">{money(g.plannedBefore)}</div>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <div className="text-xs text-muted-foreground">After target</div>
            <div className="text-lg font-semibold tabular">{money(g.plannedAfter + g.unscheduled)}</div>
          </div>
          <ul className="col-span-2 grid gap-1 text-xs">
            {g.perDebt.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span>{p.name}</span>
                <span className="text-muted-foreground tabular">
                  {money(p.before)} before · {money(p.after)} after
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

function DebtCard({ s, onEdit }: { s: DebtStats; onEdit: () => void }) {
  const { deleteDebt } = useStore()
  const { openNew, openComplete } = useTx()
  const st = STATUS[s.status]
  const d = s.debt
  return (
    <Panel
      title={
        <span className="flex items-center gap-2 text-base">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-debt-soft text-sm font-semibold text-debt">{d.name.slice(0, 1).toUpperCase()}</span>
          <span className="truncate">{d.name}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', st.cls)}>{st.label}</span>
        </span>
      }
      action={
        <div className="flex">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${d.name}`}>
            <Pencil />
          </Button>
          <Confirm
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Delete ${d.name}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete ${d.name}?`}
            description="Planned repayments are removed. Completed repayments stay in your history so your balance stays correct."
            onConfirm={() => {
              deleteDebt(d.id)
              toast('Debt deleted')
            }}
          />
        </div>
      }
    >
      <div className="grid gap-4 pt-2">
        <div className="grid grid-cols-3 gap-3">
          <Mini k="Original" v={money(d.originalAmount)} />
          <Mini k="Outstanding" v={money(s.outstanding)} cls={s.outstanding ? 'text-debt' : 'text-income'} />
          <Mini k="Repaid" v={money(s.repaid)} cls="text-income" />
        </div>
        <div>
          <Bar value={s.pct} tone="income" className="h-2" />
          <div className="mt-1.5 text-xs text-muted-foreground">{Math.round(s.pct * 100)}% repaid</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <Meta k="Interest" v={d.interestRate ? `${d.interestRate}% / yr` : 'None'} />
          <Meta k="Due" v={d.dueDate ? fmtDate(d.dueDate) : '—'} />
          <Meta k="Repayment" v={d.monthlyRepayment ? money(d.monthlyRepayment) : '—'} />
          <Meta k="Frequency" v={FREQ_LABEL[d.frequency]} />
        </dl>
        {s.monthlyInterest > 0 && <p className="text-xs text-upcoming">About {money(s.monthlyInterest)} interest per month at the current balance (estimate).</p>}
        {d.notes && <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{d.notes}</p>}

        {s.next ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <div className="text-xs text-muted-foreground">Next repayment</div>
              <div className="font-semibold tabular">{money(s.next.amount)}</div>
              <div className={cn('text-xs', s.status === 'overdue' ? 'text-overdue' : 'text-upcoming')}>
                {fmtDate(s.next.date)} · {relDays(s.next.date)}
              </div>
            </div>
            <Button size="sm" className="bg-income text-white hover:bg-income/90" onClick={() => openComplete(s.next!)}>
              Mark paid
            </Button>
          </div>
        ) : s.outstanding > 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">No repayment planned for the remaining {money(s.outstanding)}.</p>
        ) : null}
        {s.unscheduled > 0 && s.next && <p className="text-xs text-muted-foreground">{money(s.unscheduled)} not yet scheduled.</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!s.outstanding} onClick={() => openNew({ kind: 'debt_payment', debtId: d.id, category: 'Debt', status: 'completed', title: `${d.name} — repayment` })}>
            <HandCoins /> Record payment
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!s.unscheduled}
            onClick={() => openNew({ kind: 'debt_payment', debtId: d.id, category: 'Debt', status: 'planned', amount: d.monthlyRepayment ? Math.min(d.monthlyRepayment, s.unscheduled) : s.unscheduled, title: `${d.name} — repayment` })}
          >
            <CalendarPlus /> Plan payment
          </Button>
        </div>

        {s.planned.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Planned · {money(s.plannedTotal)}</div>
            <div className="-mx-2">
              {s.planned.map((t) => (
                <TxRow key={t.id} tx={t} compact hideAction />
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Payment history</div>
          {s.history.length ? (
            <div className="-mx-2">
              {s.history.map((t) => (
                <TxRow key={t.id} tx={t} compact />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No payments yet.</p>
          )}
        </div>
      </div>
    </Panel>
  )
}

function Mini({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={cn('text-sm font-semibold tabular sm:text-base', cls)}>{v}</div>
    </div>
  )
}
function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}

function DebtForm({ debt, onDone }: { debt?: Debt; onDone: () => void }) {
  const { addDebt, updateDebt } = useStore()
  const [name, setName] = useState(debt?.name ?? '')
  const [orig, setOrig] = useState(debt ? String(debt.originalAmount) : '')
  const [rate, setRate] = useState(debt?.interestRate ? String(debt.interestRate) : '')
  const [due, setDue] = useState(debt?.dueDate ?? '')
  const [monthly, setMonthly] = useState(debt?.monthlyRepayment ? String(debt.monthlyRepayment) : '')
  const [freq, setFreq] = useState<Frequency | 'flexible'>(debt?.frequency ?? 'monthly')
  const [notes, setNotes] = useState(debt?.notes ?? '')
  const [plan, setPlan] = useState(!debt)
  const [planDate, setPlanDate] = useState(todayISO())
  const [err, setErr] = useState<Record<string, string>>({})

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const o = parseAmount(orig)
    const r = rate ? Number(rate) : undefined
    const m = monthly ? parseAmount(monthly) : undefined
    const er: Record<string, string> = {}
    if (!name.trim()) er.name = 'Who do you owe?'
    if (!Number.isFinite(o) || o <= 0) er.orig = 'Enter the amount borrowed'
    if (r !== undefined && (!Number.isFinite(r) || r < 0 || r > 100)) er.rate = '0–100%'
    if (m !== undefined && (!Number.isFinite(m) || m <= 0)) er.monthly = 'Enter a positive amount'
    if (!debt && plan && !m) er.monthly = 'Needed to create a plan'
    setErr(er)
    if (Object.keys(er).length) return
    const payload = { name: name.trim(), originalAmount: o, interestRate: r, dueDate: due || undefined, monthlyRepayment: m, frequency: freq, notes: notes.trim() || undefined }
    if (debt) updateDebt(debt.id, payload)
    else addDebt(payload, plan && m ? { amount: m, date: planDate, count: 120 } : undefined)
    toast.success(debt ? 'Debt updated' : 'Debt added')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <Field label="Lender or person" error={err.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Original amount" error={err.orig}>
          <Input inputMode="decimal" value={orig} onChange={(e) => setOrig(e.target.value)} className="tabular" />
        </Field>
        <Field label="Interest % per year (optional)" error={err.rate}>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Repayment amount" error={err.monthly}>
          <Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="tabular" />
        </Field>
        <Field label="Frequency">
          <Select value={freq} onValueChange={(v) => setFreq(v as Frequency | 'flexible')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['monthly', 'weekly', 'quarterly', 'yearly', 'once', 'flexible'] as const).map((f) => (
                <SelectItem key={f} value={f}>
                  {f === 'once' ? 'Lump sum' : FREQ_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Final due date (optional)">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      {!debt && (
        <div className="grid gap-3 rounded-xl border p-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={plan} onCheckedChange={(c) => setPlan(!!c)} className="mt-0.5" />
            <span>
              Create monthly planned repayments
              <span className="block text-xs text-muted-foreground">Splits the debt into repayments of the amount above until it's covered. Edit or remove any of them later.</span>
            </span>
          </label>
          {plan && (
            <Field label="First repayment date">
              <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{debt ? 'Save' : 'Add debt'}</Button>
      </div>
    </form>
  )
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const { data, setDebtGoal } = useStore()
  const g = data.debtGoal
  const [title, setTitle] = useState(g?.title ?? 'Become debt-free')
  const [date, setDate] = useState(g?.targetDate ?? '')
  const [ids, setIds] = useState<string[]>(g?.debtIds ?? data.debts.map((x) => x.id))
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setErr('Give the goal a name')
    if (!date) return setErr('Pick a target date')
    if (!ids.length) return setErr('Include at least one debt')
    const next: DebtGoal = { title: title.trim(), targetDate: date, debtIds: ids }
    setDebtGoal(next)
    toast.success('Goal saved')
    onDone()
  }
  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <Field label="Goal name">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} />
      </Field>
      <Field label="Target date" hint={date ? `Repayments planned up to ${fmt(date, 'd MMM yyyy')} count toward this goal.` : undefined}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Debts included">
        <div className="grid gap-2 rounded-xl border p-3">
          {data.debts.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={ids.includes(x.id)} onCheckedChange={(c) => setIds(c ? [...ids, x.id] : ids.filter((i) => i !== x.id))} />
              {x.name}
            </label>
          ))}
          {!data.debts.length && <span className="text-xs text-muted-foreground">Add a debt first.</span>}
        </div>
      </Field>
      {err && <p className="text-xs text-expense">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {g && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-expense"
            onClick={() => {
              setDebtGoal(undefined)
              onDone()
            }}
          >
            Remove goal
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save goal</Button>
      </div>
    </form>
  )
}
