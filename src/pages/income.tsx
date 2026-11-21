import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Empty, Field, PageHeader, Panel, Stat } from '@/components/app/page'
import { ResponsiveModal } from '@/components/app/responsive-modal'
import { Confirm } from '@/components/app/confirm'
import { TxRow } from '@/components/app/tx-row'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { byDate, isOpen, monthKey, monthStats } from '@/lib/finance'
import { fmtDate, money, parseAmount, todayISO } from '@/lib/format'
import type { Frequency, IncomeSource } from '@/lib/types'
import { FREQ_LABEL } from '@/lib/types'

export function IncomePage() {
  const { data, deleteIncome } = useStore()
  const { openNew } = useTx()
  const [edit, setEdit] = useState<IncomeSource | 'new' | null>(null)
  const income = data.transactions.filter((t) => t.kind === 'income')
  const received = income.filter((t) => t.status === 'completed')
  const pending = income.filter(isOpen).sort(byDate)
  const month = monthKey(todayISO())
  const ms = monthStats(data, month)
  const months = Array.from(new Set(income.filter((t) => t.status !== 'cancelled').map((t) => monthKey(t.date)))).sort()
  const maxMonth = Math.max(1, ...months.map((m) => {
    const s = monthStats(data, m)
    return s.income + s.expectedIncome
  }))

  return (
    <div>
      <PageHeader
        title="Income"
        description="Expected income only reaches your balance once you mark it received."
        actions={
          <>
            <Button variant="outline" onClick={() => setEdit('new')}>
              <Repeat /> Recurring income
            </Button>
            <Button onClick={() => openNew({ kind: 'income', status: 'completed' })}>
              <Plus /> One-time income
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received this month" value={money(ms.income)} tone="income" />
        <Stat label="Still expected this month" value={money(ms.expectedIncome)} tone="upcoming" />
        <Stat label="Received in total" value={money(received.reduce((a, t) => a + t.amount, 0))} hint={`${received.length} payments`} />
        <Stat label="Pending (all upcoming)" value={money(pending.reduce((a, t) => a + t.amount, 0))} hint={`${pending.length} payments`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-5">
          <Panel title="Recurring income" description="Salaries and regular payments">
            {data.incomes.length ? (
              <div className="divide-y">
                {data.incomes.map((s) => {
                  const next = pending.find((t) => t.incomeId === s.id)
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {money(s.amount)} · {FREQ_LABEL[s.frequency].toLowerCase()} · {s.category}
                          {next && ` · next ${fmtDate(next.date)}`}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setEdit(s)} aria-label={`Edit ${s.name}`}>
                        <Pencil />
                      </Button>
                      <Confirm
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`}>
                            <Trash2 />
                          </Button>
                        }
                        title={`Delete ${s.name}?`}
                        description="Expected payments from this source are removed. Payments already received stay in your history."
                        onConfirm={() => {
                          deleteIncome(s.id)
                          toast('Income source deleted')
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty>No recurring income yet.</Empty>
            )}
          </Panel>

          <Panel title="Monthly income history" description="Received (solid) vs. expected (faded)">
            {months.length ? (
              <div className="grid gap-3">
                {months.map((m) => {
                  const s = monthStats(data, m)
                  return (
                    <div key={m}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium">{format(parseISO(`${m}-01`), 'MMMM yyyy')}</span>
                        <span className="text-muted-foreground tabular">
                          {money(s.income)} received{s.expectedIncome ? ` · ${money(s.expectedIncome)} expected` : ''}
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <div className="bar bg-income" style={{ width: `${(s.income / maxMonth) * 100}%` }} />
                        <div className="bar bg-income/30" style={{ width: `${(s.expectedIncome / maxMonth) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty>No income recorded.</Empty>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel title="Expected payments" description="Mark each one received when it lands" bodyClassName="px-3">
            {pending.length ? pending.map((t) => <TxRow key={t.id} tx={t} rel />) : <Empty>No pending income.</Empty>}
          </Panel>
          <Panel title="Received" bodyClassName="px-3">
            {received.length ? [...received].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((t) => <TxRow key={t.id} tx={t} />) : <Empty>Nothing received yet.</Empty>}
          </Panel>
        </div>
      </div>

      <ResponsiveModal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add recurring income' : 'Edit recurring income'} description="Creates expected payments you can mark as received.">
        {edit && <IncomeForm src={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </ResponsiveModal>
    </div>
  )
}

function IncomeForm({ src, onDone }: { src?: IncomeSource; onDone: () => void }) {
  const { data, addIncome, updateIncome } = useStore()
  const [name, setName] = useState(src?.name ?? 'Salary')
  const [amt, setAmt] = useState(src ? String(src.amount) : '')
  const [freq, setFreq] = useState<Frequency>(src?.frequency ?? 'monthly')
  const [first, setFirst] = useState(src?.firstDate ?? todayISO())
  const [count, setCount] = useState(String(src?.occurrences ?? 12))
  const [cat, setCat] = useState(src?.category ?? data.settings.incomeCategories[0] ?? 'Salary')
  const [acc, setAcc] = useState(src?.accountId ?? data.accounts[0]?.id ?? '')
  const [err, setErr] = useState<Record<string, string>>({})

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseAmount(amt)
    const c = Number(count)
    const er: Record<string, string> = {}
    if (!name.trim()) er.name = 'Give it a name'
    if (!Number.isFinite(n) || n <= 0) er.amount = 'Enter an amount above zero'
    if (!first) er.first = 'Pick the first payment date'
    if (freq !== 'once' && (!Number.isInteger(c) || c < 1 || c > 120)) er.count = 'Between 1 and 120'
    setErr(er)
    if (Object.keys(er).length) return
    const s = { name: name.trim(), amount: n, frequency: freq, firstDate: first, occurrences: freq === 'once' ? 1 : c, category: cat, accountId: acc }
    if (src) updateIncome({ ...src, ...s })
    else addIncome(s)
    toast.success(src ? 'Income updated — expected payments rescheduled' : 'Recurring income added')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <Field label="Name" error={err.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount each time" error={err.amount}>
          <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} className="tabular" />
        </Field>
        <Field label="Frequency">
          <Select value={freq} onValueChange={(v) => setFreq(v as Frequency)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['weekly', 'monthly', 'quarterly', 'yearly', 'once'] as Frequency[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQ_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="First payment date" error={err.first}>
          <Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        {freq !== 'once' && (
          <Field label="Number of payments" error={err.count}>
            <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <Field label="Category">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.settings.incomeCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Paid into">
          <Select value={acc} onValueChange={setAcc}>
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
        </Field>
      </div>
      {src && <p className="text-xs text-muted-foreground">Received payments are never changed. If you keep the same amount, any payment you edited individually keeps its own amount.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{src ? 'Save' : 'Add income'}</Button>
      </div>
    </form>
  )
}

