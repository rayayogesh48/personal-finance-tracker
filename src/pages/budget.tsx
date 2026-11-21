import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bar, PageHeader, Panel, Stat } from '@/components/app/page'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { activeMonths, budgetStatus, monthKey, type BudgetState } from '@/lib/finance'
import { currencySymbol, money, parseAmount, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

const tone = (s: BudgetState) => (s === 'over' ? 'expense' : s === 'warn' ? 'upcoming' : 'income') as 'expense' | 'upcoming' | 'income'

export function BudgetPage() {
  const { data, setBudget, addCategory, updateSettings } = useStore()
  const { openNew } = useTx()
  const months = activeMonths(data)
  const [month, setMonth] = useState(monthKey(todayISO()))
  const [newCat, setNewCat] = useState('')
  const b = budgetStatus(data, month)
  const flagged = b.rows.filter((r) => r.state === 'over' || r.state === 'warn')
  const isCurrent = month === monthKey(todayISO())

  return (
    <div>
      <PageHeader
        title="Budget"
        description="Limits apply every month and spending starts again from zero each month. Only completed spending counts."
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44" aria-label="Month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {format(parseISO(`${m}-01`), 'MMMM yyyy')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly budget" value={money(b.limitTotal)} hint={data.settings.monthlyBudget ? 'Overall limit' : 'Sum of category limits'} />
        <Stat label="Spent" value={money(b.spent)} tone="expense" hint={<Bar value={b.pct} tone={tone(b.state)} className="mt-1.5" />} />
        <Stat label="Remaining" value={money(b.remaining)} tone={b.remaining < 0 ? 'expense' : 'income'} hint={b.remaining < 0 ? 'Over budget' : isCurrent ? 'Left this month' : 'Left that month'} />
        <Stat label="Used" value={`${Math.round(b.pct * 100)}%`} tone={b.state === 'over' ? 'expense' : b.state === 'warn' ? 'upcoming' : 'default'} hint={`Warning at ${data.settings.budgetWarnPct}%`} />
      </div>

      {(b.state === 'over' || b.state === 'warn' || flagged.length > 0) && (
        <div className={cn('mb-5 flex gap-3 rounded-2xl p-4 text-sm', b.state === 'over' || flagged.some((r) => r.state === 'over') ? 'bg-expense-soft' : 'bg-upcoming-soft')}>
          <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', b.state === 'over' ? 'text-expense' : 'text-upcoming')} />
          <div>
            {b.state === 'over' && <div className="font-medium text-expense">You've gone over your monthly budget by {money(-b.remaining)}.</div>}
            {b.state === 'warn' && <div className="font-medium text-upcoming">You've used {Math.round(b.pct * 100)}% of your monthly budget.</div>}
            {flagged.map((r) => (
              <div key={r.category} className="text-foreground/80">
                {r.category}: {money(r.spent)} of {money(r.limit)} {r.state === 'over' ? `— over by ${money(-r.remaining)}` : `— ${Math.round(r.pct * 100)}% used`}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Category limits" description="Edit a limit and press Enter. Leave empty for no limit." bodyClassName="px-2 sm:px-5">
          <div className="divide-y">
            {b.rows.map((r) => (
              <div key={`${r.category}-${r.limit}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-2 py-3 sm:grid-cols-[1.2fr_130px_1fr_auto]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.category}</div>
                  <div className={cn('text-xs tabular', r.state === 'over' ? 'text-expense' : r.state === 'warn' ? 'text-upcoming' : 'text-muted-foreground')}>
                    {money(r.spent)} spent{r.limit ? ` · ${r.remaining >= 0 ? `${money(r.remaining)} left` : `${money(-r.remaining)} over`}` : ''}
                  </div>
                </div>
                <LimitInput value={r.limit} onSave={(n) => setBudget(r.category, n)} label={r.category} />
                <div className="col-span-2 sm:col-span-1">{r.limit ? <Bar value={r.pct} tone={tone(r.state)} /> : <span className="text-xs text-muted-foreground">No limit</span>}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex"
                  aria-label={`Add ${r.category} expense`}
                  onClick={() => openNew({ kind: 'expense', category: r.category, status: 'completed' })}
                >
                  <Plus />
                </Button>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2 px-2"
            onSubmit={(e) => {
              e.preventDefault()
              const n = newCat.trim()
              if (!n) return
              if (data.settings.expenseCategories.some((c) => c.toLowerCase() === n.toLowerCase())) return void toast.error('That category already exists')
              addCategory('expense', n)
              setNewCat('')
              toast.success(`Added ${n}`)
            }}
          >
            <Input placeholder="New category (e.g. Gym)" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={30} className="max-w-xs" />
            <Button type="submit" variant="outline" disabled={!newCat.trim()}>
              <Plus /> Add
            </Button>
          </form>
        </Panel>

        <Panel title="Overall monthly budget" description="A single cap across all spending. Leave at 0 to use the sum of category limits.">
          <div className="grid gap-4">
            <LimitInput value={data.settings.monthlyBudget} onSave={(n) => updateSettings({ monthlyBudget: n })} label="Overall monthly budget" wide />
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Warn me at</div>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                {[70, 80, 90, 100].map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => updateSettings({ budgetWarnPct: p })}
                    className={cn('pressable rounded-lg py-1.5 text-xs font-medium', data.settings.budgetWarnPct === p ? 'bg-card shadow-sm' : 'text-muted-foreground')}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Budgets never deduct money. Planned expenses don't count until you mark them completed.</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function LimitInput({ value, onSave, label, wide }: { value: number; onSave: (n: number) => void; label: string; wide?: boolean }) {
  const [v, setV] = useState(value ? String(value) : '')
  const [bad, setBad] = useState(false)
  const commit = () => {
    const n = v.trim() ? parseAmount(v) : 0
    if (!Number.isFinite(n) || n < 0) return setBad(true)
    setBad(false)
    if (n !== value) onSave(n)
  }
  return (
    <div className={cn('relative', wide ? 'w-full' : 'w-[130px]')}>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">{currencySymbol()}</span>
      <Input
        inputMode="decimal"
        value={v}
        placeholder="0"
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-8 pl-9 tabular"
        aria-label={`${label} limit`}
        aria-invalid={bad}
      />
    </div>
  )
}
