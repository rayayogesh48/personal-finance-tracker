import { useState } from 'react'
import { toast } from 'sonner'
import { BellRing, ChevronDown, Hourglass, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bar, Empty, Field, PageHeader, Panel, Stat } from '@/components/app/page'
import { ResponsiveModal } from '@/components/app/responsive-modal'
import { Confirm } from '@/components/app/confirm'
import { TxRow } from '@/components/app/tx-row'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { billStats, isOpen, isOverdue } from '@/lib/finance'
import { billAmount, emiCalc } from '@/lib/schedule'
import { fmtDate, money, parseAmount, relDays, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Bill, BillKind, Frequency } from '@/lib/types'
import { BILL_KIND_LABEL, FREQ_LABEL } from '@/lib/types'

export function BillsPage() {
  const { data } = useStore()
  const [edit, setEdit] = useState<Bill | 'new' | null>(null)
  const all = data.bills.map((b) => ({ b, s: billStats(data, b) }))
  const due30 = all.flatMap(({ s }) => s.installments.filter((t) => isOpen(t) && t.date <= addDaysISO(30)))
  const monthly = data.bills.filter((b) => b.frequency === 'monthly' && !b.notStarted).reduce((a, b) => a + billAmount(b), 0)

  return (
    <div>
      <PageHeader
        title="Bills & EMI"
        description="Recurring payments and installments. Each payment is planned until you mark it paid."
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus /> Add bill or EMI
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly commitments" value={money(monthly)} tone="bill" hint="Sum of monthly bills & EMIs" />
        <Stat label="Due in 30 days" value={money(due30.reduce((a, t) => a + t.amount, 0))} tone="upcoming" hint={`${due30.length} payment${due30.length === 1 ? '' : 's'}`} />
        <Stat
          label="Still to pay"
          value={money(all.filter((x) => x.s.phase !== 'on-hold').reduce((a, x) => a + x.s.remainingAmount, 0))}
          hint={
            all.some((x) => x.s.phase === 'on-hold')
              ? `+${money(all.filter((x) => x.s.phase === 'on-hold').reduce((a, x) => a + x.s.remainingAmount, 0))} not started yet`
              : `${all.reduce((a, x) => a + x.s.remainingCount, 0)} payments left`
          }
        />
        <Stat label="Paid so far" value={money(all.reduce((a, x) => a + x.s.paidAmount + (x.s.down?.status === 'completed' ? x.s.down.amount : 0), 0))} tone="income" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {all.map(({ b }) => (
          <BillCard key={b.id} bill={b} onEdit={() => setEdit(b)} />
        ))}
        {!all.length && <Empty>No bills yet. Add rent, subscriptions, a credit card or an EMI.</Empty>}
      </div>
      <ResponsiveModal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add bill or EMI' : `Edit ${edit?.name ?? ''}`}>
        {edit && <BillForm bill={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </ResponsiveModal>
    </div>
  )
}

const addDaysISO = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function BillCard({ bill, onEdit }: { bill: Bill; onEdit: () => void }) {
  const { data, deleteBill, startBill } = useStore()
  const { openComplete } = useTx()
  const [open, setOpen] = useState(false)
  const s = billStats(data, bill)
  const count = s.installments.length
  const overdue = s.next ? isOverdue(s.next) : false
  const calc = bill.emi ? emiCalc(bill.emi.price, bill.emi.downPayment, bill.emi.interestRate, bill.occurrences) : undefined
  const state =
    s.phase === 'on-hold'
      ? { l: 'Not started yet', c: 'bg-muted text-muted-foreground' }
      : s.phase === 'done'
        ? { l: 'Paid off', c: 'bg-income-soft text-income' }
        : overdue
          ? { l: 'Overdue', c: 'bg-overdue-soft text-overdue' }
          : s.reminderDue
            ? { l: 'Due soon', c: 'bg-upcoming-soft text-upcoming' }
            : s.phase === 'not-started'
              ? { l: 'Not started', c: 'bg-bill-soft text-bill' }
              : { l: 'Active', c: 'bg-muted text-muted-foreground' }
  const onHold = s.phase === 'on-hold'

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2 text-base">
          {bill.name}
          <span className="rounded-md bg-bill-soft px-1.5 py-0.5 text-[11px] font-medium text-bill">{BILL_KIND_LABEL[bill.kind]}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', state.c)}>{state.l}</span>
        </span>
      }
      description={`${money(billAmount(bill))} · ${FREQ_LABEL[bill.frequency].toLowerCase()}${bill.external ? ' · paid from outside' : ''}`}
      action={
        <div className="flex">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${bill.name}`}>
            <Pencil />
          </Button>
          <Confirm
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Delete ${bill.name}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete ${bill.name}?`}
            description="Upcoming payments are removed. Completed payments stay in your history."
            onConfirm={() => {
              deleteBill(bill.id)
              toast('Bill deleted')
            }}
          />
        </div>
      }
    >
      <div className="grid gap-4 pt-1">
        {onHold && (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center">
            <Hourglass className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 text-sm">
              <div className="font-medium">Not started yet</div>
              <div className="text-xs text-muted-foreground">
                {count} payment{count === 1 ? '' : 's'} of {money(billAmount(bill))} {bill.emi ? `would begin after a purchase on ${fmtDate(bill.emi.purchaseDate)}` : `would begin ${fmtDate(bill.firstDueDate)}`}. They're kept out of your forecast, reminders and totals until you start.
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                startBill(bill.id)
                toast.success(`${bill.name} started — payments added to your forecast`)
              }}
            >
              <Play /> Start now
            </Button>
          </div>
        )}
        {!onHold && s.phase === 'not-started' && (
          <p className="rounded-xl bg-bill-soft px-3 py-2 text-xs text-bill">
            Starts {fmtDate(s.startDate)} · {relDays(s.startDate)}. Payments are already in your forecast.
          </p>
        )}
        {s.next && !onHold && (
          <div className={cn('flex items-center justify-between gap-3 rounded-xl p-3', overdue ? 'bg-overdue-soft' : s.reminderDue ? 'bg-upcoming-soft' : 'bg-muted/60')}>
            <div>
              <div className={cn('flex items-center gap-1.5 text-xs', overdue ? 'text-overdue' : s.reminderDue ? 'text-upcoming' : 'text-muted-foreground')}>
                {s.reminderDue && <BellRing className="size-3.5" />} Next payment
              </div>
              <div className="font-semibold tabular">{money(s.next.amount)}</div>
              <div className="text-xs text-muted-foreground">
                {fmtDate(s.next.date)} · {relDays(s.next.date)}
              </div>
            </div>
            <Button size="sm" className="bg-income text-white hover:bg-income/90" onClick={() => openComplete(s.next!)}>
              Mark paid
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-semibold tabular">{money(s.total)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Remaining</div>
            <div className="font-semibold tabular">{money(s.remainingAmount)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{count > 1 ? 'Installments' : 'Payment'}</div>
            <div className="font-semibold tabular">
              {s.paidCount} / {count} paid
            </div>
          </div>
        </div>
        {count > 1 && <Bar value={count ? s.paidCount / count : 0} tone="bill" />}

        {bill.emi && calc && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border p-3 text-xs sm:grid-cols-3">
            <Meta k="Price" v={money(bill.emi.price)} />
            <Meta k="Down payment" v={`${money(bill.emi.downPayment)}${s.down ? (s.down.status === 'completed' ? ' · paid' : ' · planned') : ''}`} />
            <Meta k="Financed" v={money(calc.financed)} />
            <Meta k="Interest" v={bill.emi.interestRate ? `${bill.emi.interestRate}% / yr` : '0% (no interest)'} />
            <Meta k="Total interest" v={money(calc.totalInterest)} />
            <Meta k="Purchased" v={fmtDate(bill.emi.purchaseDate)} />
          </dl>
        )}
        {s.down && isOpen(s.down) && !onHold && (
          <Button variant="outline" size="sm" onClick={() => openComplete(s.down!)}>
            Mark down payment of {money(s.down.amount)} as paid
          </Button>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Reminder {bill.reminderDays} day{bill.reminderDays === 1 ? '' : 's'} before</span>
          {s.txs.length > 0 && (
            <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 font-medium text-foreground" aria-expanded={open}>
              Schedule <ChevronDown className={cn('size-3.5 transition-transform duration-200 ease-(--ease-out)', open && 'rotate-180')} />
            </button>
          )}
        </div>
        {open && (
          <div className="-mx-2 max-h-80 overflow-y-auto">
            {s.txs.map((t) => (
              <TxRow key={t.id} tx={t} compact />
            ))}
          </div>
        )}
        {bill.notes && <p className="text-xs text-muted-foreground">{bill.notes}</p>}
      </div>
    </Panel>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular">{v}</dd>
    </div>
  )
}

function BillForm({ bill, onDone }: { bill?: Bill; onDone: () => void }) {
  const { data, addBill, updateBill } = useStore()
  const [kind, setKind] = useState<BillKind>(bill?.kind ?? 'subscription')
  const [name, setName] = useState(bill?.name ?? '')
  const [amt, setAmt] = useState(bill && bill.kind !== 'emi' ? String(bill.amount) : '')
  const [freq, setFreq] = useState<Frequency>(bill?.frequency ?? 'monthly')
  const [first, setFirst] = useState(bill?.firstDueDate ?? todayISO())
  const [count, setCount] = useState(String(bill?.occurrences ?? 12))
  const [remind, setRemind] = useState(String(bill?.reminderDays ?? 3))
  const [cat, setCat] = useState(bill?.category ?? 'Internet & Utilities')
  const [external, setExternal] = useState(!!bill?.external)
  const [notStarted, setNotStarted] = useState(!!bill?.notStarted)
  const [notes, setNotes] = useState(bill?.notes ?? '')
  const [price, setPrice] = useState(bill?.emi ? String(bill.emi.price) : '')
  const [down, setDown] = useState(bill?.emi ? String(bill.emi.downPayment) : '')
  const [rate, setRate] = useState(bill?.emi ? String(bill.emi.interestRate) : '0')
  const [purchase, setPurchase] = useState(bill?.emi?.purchaseDate ?? todayISO())
  const [err, setErr] = useState<Record<string, string>>({})
  const isEmi = kind === 'emi'
  const billPaidAny = !!bill && data.transactions.some((t) => t.billId === bill.id && t.status === 'completed')
  const preview = isEmi && Number.isFinite(parseAmount(price)) ? emiCalc(parseAmount(price), parseAmount(down || '0') || 0, Number(rate) || 0, Number(count) || 1) : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    const c = Number(count)
    const r = Number(rate)
    const rd = Number(remind)
    if (!name.trim()) er.name = 'Give it a name'
    if (!first) er.first = 'Pick a due date'
    if ((isEmi || freq !== 'once') && (!Number.isInteger(c) || c < 1 || c > 360)) er.count = '1–360'
    if (!Number.isInteger(rd) || rd < 0 || rd > 60) er.remind = '0–60 days'
    let amount = parseAmount(amt)
    let emi: Bill['emi']
    if (isEmi) {
      const p = parseAmount(price)
      const dp = down.trim() ? parseAmount(down) : 0
      if (!Number.isFinite(p) || p <= 0) er.price = 'Enter the price'
      if (!Number.isFinite(dp) || dp < 0) er.down = 'Enter 0 or more'
      else if (Number.isFinite(p) && dp >= p) er.down = 'Must be less than the price'
      if (!Number.isFinite(r) || r < 0 || r > 100) er.rate = '0–100%'
      if (!purchase) er.purchase = 'Pick a date'
      if (purchase && first && first < purchase) er.first = 'On or after the purchase date'
      emi = { price: p, downPayment: dp, interestRate: r, purchaseDate: purchase }
      amount = 0
    } else if (!Number.isFinite(amount) || amount <= 0) er.amt = 'Enter an amount above zero'
    setErr(er)
    if (Object.keys(er).length) return
    const payload: Omit<Bill, 'id'> = {
      name: name.trim(),
      kind,
      amount,
      frequency: isEmi ? 'monthly' : freq,
      firstDueDate: first,
      occurrences: isEmi || freq !== 'once' ? c : 1,
      reminderDays: rd,
      category: cat,
      external: external || undefined,
      notStarted: notStarted || undefined,
      notes: notes.trim() || undefined,
      emi,
    }
    if (bill) updateBill({ ...payload, id: bill.id })
    else addBill(payload)
    toast.success(bill ? 'Saved — upcoming payments rescheduled' : 'Added')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={kind} onValueChange={(v) => setKind(v as BillKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BILL_KIND_LABEL) as BillKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {BILL_KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Name" error={err.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={isEmi ? 'e.g. Phone EMI' : 'e.g. Netflix'} />
        </Field>
      </div>

      {isEmi ? (
        <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
          <Field label="Price" error={err.price}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="tabular" />
          </Field>
          <Field label="Down payment" error={err.down}>
            <Input inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} className="tabular" placeholder="0" />
          </Field>
          <Field label="Interest % per year" error={err.rate} hint="0 for no-cost EMI">
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field label="Months" error={err.count}>
            <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Purchase date" error={err.purchase}>
            <Input type="date" value={purchase} onChange={(e) => setPurchase(e.target.value)} />
          </Field>
          <Field label="First installment" error={err.first}>
            <Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          {preview && preview.financed > 0 && (
            <p className="col-span-2 rounded-lg bg-muted/60 p-2.5 text-sm">
              <b className="tabular">{money(preview.monthly)}</b>/month · financed {money(preview.financed)} · interest {money(preview.totalInterest)}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount each time" error={err.amt}>
            <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} className="tabular" />
          </Field>
          <Field label="Frequency">
            <Select value={freq} onValueChange={(v) => setFreq(v as Frequency)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['monthly', 'weekly', 'quarterly', 'yearly', 'once'] as Frequency[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={freq === 'once' ? 'Due date' : 'First due date'} error={err.first}>
            <Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          {freq !== 'once' && (
            <Field label="Payments to schedule" error={err.count}>
              <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
            </Field>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set([...data.settings.expenseCategories, cat])).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Remind me (days before)" error={err.remind}>
          <Input inputMode="numeric" value={remind} onChange={(e) => setRemind(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <span>
          Not started yet
          <span className="block text-xs text-muted-foreground">Still deciding or not bought yet. Payments stay out of forecasts and reminders until you start it.</span>
        </span>
        <Switch checked={notStarted} onCheckedChange={setNotStarted} disabled={!!bill && billPaidAny} />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <span>
          Paid from outside
          <span className="block text-xs text-muted-foreground">Funded from money you don't track here — never affects your balance or forecast.</span>
        </span>
        <Switch checked={external} onCheckedChange={setExternal} />
      </label>
      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      </Field>
      {bill && <p className="text-xs text-muted-foreground">Paid installments are never changed; only upcoming ones are rescheduled.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{bill ? 'Save' : 'Add'}</Button>
      </div>
    </form>
  )
}
