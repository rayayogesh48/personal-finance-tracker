import { useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Lock, Plus, TrendingDown, Wallet, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, PageHeader, Panel, Stat } from '@/components/app/page'
import { KIND_STYLE } from '@/components/app/badges'
import { ForecastChart } from '@/components/app/charts'
import { TxRow } from '@/components/app/tx-row'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { cashSummary, isOverdue, monthlyProjection } from '@/lib/finance'
import { fmt, fmtDate, money, moneyCompact, todayISO, toISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Transaction, TxKind } from '@/lib/types'

export function CashFlowPage() {
  const { data, updateSettings } = useStore()
  const cash = cashSummary(data)
  const proj = monthlyProjection(data, 6)
  return (
    <div>
      <PageHeader title="Cash flow" description="Your actual balance and your forecast are kept separate. Planned items never touch actual cash." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Actual balance" value={money(cash.actual)} icon={<Wallet />} tone="income" hint="Completed transactions only" />
        <Stat label="Reserved" value={money(cash.reserved)} icon={<Lock />} tone="reserved" hint={`Available ${money(cash.available)}`} />
        <Stat label={`Forecast · end of ${fmt(`${proj[0].month}-01`, 'MMMM')}`} value={money(proj[0].closing)} icon={<CalendarRange />} tone={proj[0].closing < 0 ? 'expense' : 'default'} hint="If everything planned happens" />
        <Stat label="Lowest point ahead" value={money(cash.min.balance)} icon={<TrendingDown />} tone={cash.min.balance < 0 ? 'expense' : 'default'} hint={fmtDate(cash.min.date)} />
      </div>

      <Tabs defaultValue="calendar">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
          </TabsList>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Include optional expenses in forecast
            <Switch checked={data.settings.includeOptionalInForecast} onCheckedChange={(c) => updateSettings({ includeOptionalInForecast: c })} />
          </label>
        </div>
        <TabsContent value="calendar">
          <CalendarView />
        </TabsContent>
        <TabsContent value="forecast" className="grid gap-5">
          <Panel title="Balance over time" description="Green = actual history · Blue = forecast">
            <ForecastChart markDate={data.debtGoal?.targetDate} />
          </Panel>
          <Panel title="Monthly projection" description="Opening balance + expected income − planned outflows = projected closing balance" bodyClassName="px-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Month</th>
                    <th className="py-2 text-right font-medium">Opening</th>
                    <th className="py-2 text-right font-medium">+ Expected income</th>
                    <th className="py-2 text-right font-medium">− Planned outflows</th>
                    <th className="px-5 py-2 text-right font-medium">= Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {proj.map((r, i) => (
                    <tr key={r.month} className="border-b last:border-0">
                      <td className="px-5 py-2.5 font-medium">
                        {fmt(`${r.month}-01`, 'MMMM yyyy')}
                        {i === 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">(from today, incl. overdue)</span>}
                      </td>
                      <td className="py-2.5 text-right tabular">{money(r.opening)}</td>
                      <td className="py-2.5 text-right text-income tabular">{money(r.income)}</td>
                      <td className="py-2.5 text-right text-expense tabular">{money(r.outflow)}</td>
                      <td className={cn('px-5 py-2.5 text-right font-semibold tabular', r.closing < 0 && 'text-expense')}>{money(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  )
}

const LEGEND: { kind: TxKind; label: string }[] = [
  { kind: 'income', label: 'Income' },
  { kind: 'expense', label: 'Expense' },
  { kind: 'debt_payment', label: 'Debt' },
  { kind: 'bill_payment', label: 'Bill / EMI' },
  { kind: 'savings', label: 'Savings' },
]

function CalendarView() {
  const { data } = useStore()
  const { openEdit, openNew } = useTx()
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [selected, setSelected] = useState(todayISO())
  const byDay = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of data.transactions) {
      if (t.status === 'cancelled' || t.onHold) continue
      const arr = m.get(t.date) ?? []
      arr.push(t)
      m.set(t.date, arr)
    }
    return m
  }, [data.transactions])
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) })
  const key = format(month, 'yyyy-MM')
  const monthTx = data.transactions.filter((t) => t.date.startsWith(key) && t.status !== 'cancelled' && !t.onHold).sort((a, b) => a.date.localeCompare(b.date))
  const inSum = monthTx.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0)
  const outSum = monthTx.filter((t) => t.kind !== 'income' && t.kind !== 'transfer').reduce((a, t) => a + t.amount, 0)
  const sel = byDay.get(selected) ?? []

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Panel bodyClassName="p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <h2 className="min-w-36 text-center font-semibold">{format(month, 'MMMM yyyy')}</h2>
            <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <ChevronRight />
            </Button>
            {key !== todayISO().slice(0, 7) && (
              <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
                Today
              </Button>
            )}
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-income tabular">In {money(inSum)}</span>
            <span className="text-expense tabular">Out {money(outSum)}</span>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b pb-2 text-center text-[11px] font-medium text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const iso = toISO(d)
            const items = byDay.get(iso) ?? []
            const goalDay = data.debtGoal?.targetDate === iso
            return (
              <button
                type="button"
                key={iso}
                onClick={() => setSelected(iso)}
                aria-label={`${fmt(iso, 'd MMMM')}, ${items.length} items`}
                aria-pressed={selected === iso}
                className={cn(
                  'flex min-h-14 flex-col border-r border-b p-1 text-left [&:nth-child(7n)]:border-r-0 sm:min-h-24 sm:p-1.5',
                  !isSameMonth(d, month) && 'bg-muted/30 text-muted-foreground/60',
                  selected === iso && 'bg-muted/70',
                  goalDay && 'bg-debt-soft',
                )}
              >
                <span className={cn('inline-flex size-6 items-center justify-center rounded-full text-xs tabular', iso === todayISO() && 'bg-foreground font-semibold text-background')}>{format(d, 'd')}</span>
                <span className="mt-1 hidden w-full gap-0.5 sm:grid">
                  {goalDay && <span className="truncate px-1 text-[10px] font-medium text-debt">{data.debtGoal!.title}</span>}
                  {items.slice(0, 3).map((t) => (
                    <Pill key={t.id} t={t} onClick={() => openEdit(t)} />
                  ))}
                  {items.length > 3 && <span className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</span>}
                </span>
                <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {items.slice(0, 4).map((t) => (
                    <span key={t.id} className={cn('size-1.5 rounded-full', isOverdue(t) ? 'bg-overdue' : t.status === 'planned' && t.kind !== 'income' ? 'bg-upcoming' : KIND_STYLE[t.kind].dot)} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          {LEGEND.map((l) => (
            <span key={l.kind} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-sm', KIND_STYLE[l.kind].dot)} /> {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm border border-dashed border-upcoming" /> Upcoming (planned)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-overdue" /> Overdue
          </span>
        </div>
      </Panel>

      <div className="grid content-start gap-5">
        <Panel
          title={fmt(selected, 'EEEE, d MMMM')}
          description={`${sel.length} item${sel.length === 1 ? '' : 's'}`}
          action={
            <Button variant="ghost" size="icon" onClick={() => openNew({ date: selected, status: selected > todayISO() ? 'planned' : 'completed' })} aria-label="Add on this day">
              <Plus />
            </Button>
          }
          bodyClassName="px-3"
        >
          {sel.length ? sel.map((t) => <TxRow key={t.id} tx={t} />) : <Empty>Nothing on this day.</Empty>}
        </Panel>
        <Panel title={`${format(month, 'MMMM')} at a glance`} bodyClassName="px-3">
          {monthTx.length ? monthTx.map((t) => <TxRow key={t.id} tx={t} compact hideAction />) : <Empty>Nothing this month.</Empty>}
        </Panel>
      </div>
    </div>
  )
}

function Pill({ t, onClick }: { t: Transaction; onClick: () => void }) {
  const s = KIND_STYLE[t.kind]
  const planned = t.status === 'planned'
  const overdue = isOverdue(t)
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          onClick()
        }
      }}
      title={`${t.title} · ${money(t.amount)} · ${t.onHold ? 'not started' : planned ? 'planned' : 'completed'}`}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium',
        !planned ? s.chip : t.onHold ? 'border border-dashed border-muted-foreground/40 bg-card text-muted-foreground opacity-70' : overdue ? 'border border-overdue bg-overdue-soft text-overdue' : cn('border border-dashed bg-card', t.kind === 'income' ? 'border-income text-income' : 'border-upcoming text-upcoming'),
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', s.dot)} />
      <span className="truncate">{t.title.split(' — ')[0]}</span>
      <span className="ml-auto shrink-0 tabular opacity-80">{moneyCompact(t.amount)}</span>
    </span>
  )
}
