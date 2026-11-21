import { useMemo } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '@/lib/store'
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { affectsCash, forecastTimeline, isDone, monthStats, monthsRange, signed } from '@/lib/finance'
import { money, moneyCompact, todayISO, toISO } from '@/lib/format'

// Charts show functional data, so they never animate (isAnimationActive=false).

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="max-w-64 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">{children}</div>
}

const axis = { tickLine: false, axisLine: false, fontSize: 11, stroke: 'var(--muted-foreground)' }

export function IncomeExpenseChart({ months = 6, height = 220 }: { months?: number; height?: number }) {
  const { data } = useStore()
  const rows = useMemo(() => {
    const keys = monthsRange(toISO(new Date(new Date().getFullYear(), new Date().getMonth() - (months - 3), 1)), toISO(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1)))
    return keys.map((m) => {
      const s = monthStats(data, m)
      return { m, label: format(parseISO(`${m}-01`), 'MMM'), income: s.income, expenses: s.spending, expIncome: s.expectedIncome, expSpend: s.plannedSpending }
    })
  }, [data, months])
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 4, right: 0, left: -12, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis tickFormatter={moneyCompact} {...axis} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as (typeof rows)[number]
              return (
                <TipBox>
                  <div className="mb-1 font-medium">{format(parseISO(`${r.m}-01`), 'MMMM yyyy')}</div>
                  <div className="text-income tabular">Income {money(r.income)}{r.expIncome ? ` (+${money(r.expIncome)} expected)` : ''}</div>
                  <div className="text-expense tabular">Expenses {money(r.expenses)}{r.expSpend ? ` (+${money(r.expSpend)} planned)` : ''}</div>
                </TipBox>
              )
            }}
          />
          <Bar dataKey="income" stackId="i" fill="var(--income)" radius={[0, 0, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expIncome" stackId="i" fill="var(--income)" fillOpacity={0.25} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expenses" stackId="e" fill="var(--expense)" isAnimationActive={false} />
          <Bar dataKey="expSpend" stackId="e" fill="var(--expense)" fillOpacity={0.25} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface CategoryRow {
  category: string
  spent: number
  planned: number
  limit?: number
}

/** Largest-remainder rounding so the shown shares always add up to exactly 100%. */
function shares(values: number[]) {
  const total = values.reduce((a, v) => a + v, 0)
  if (!total) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, v) => a + v, 0)
  raw
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((x, y) => y.r - x.r)
    .forEach(({ i }) => {
      if (left-- > 0) out[i]++
    })
  return out
}

/**
 * Spending by category as ranked horizontal bars (one hue):
 * solid = spent (completed), faded = still planned this month, tick = budget limit.
 * Ranked bars on a shared baseline compare categories far better than donut slices.
 */
export function CategoryBars({ spent, planned = {}, budgets = {}, max = 6 }: { spent: Record<string, number>; planned?: Record<string, number>; budgets?: Record<string, number>; max?: number }) {
  const cats = Array.from(new Set([...Object.keys(spent), ...Object.keys(planned)]))
  let rows: CategoryRow[] = cats
    .map((c) => ({ category: c, spent: spent[c] ?? 0, planned: planned[c] ?? 0, limit: budgets[c] || undefined }))
    .filter((r) => r.spent + r.planned > 0)
    .sort((a, b) => b.spent + b.planned - (a.spent + a.planned) || a.category.localeCompare(b.category))
  if (!rows.length) return null
  // Fold a long tail into "Other" so the card stays readable.
  if (rows.length > max) {
    const tail = rows.slice(max - 1)
    rows = [...rows.slice(0, max - 1), { category: `Other (${tail.length})`, spent: tail.reduce((a, r) => a + r.spent, 0), planned: tail.reduce((a, r) => a + r.planned, 0) }]
  }
  const totalSpent = rows.reduce((a, r) => a + r.spent, 0)
  const totalPlanned = rows.reduce((a, r) => a + r.planned, 0)
  const scale = Math.max(...rows.map((r) => Math.max(r.spent + r.planned, r.limit ?? 0)))
  const pct = shares(rows.map((r) => r.spent + r.planned))
  const hasPlanned = totalPlanned > 0
  const pctOf = (v: number) => `${(v / scale) * 100}%`

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-2xl font-semibold tracking-tight tabular">{money(totalSpent + totalPlanned)}</div>
          <div className="text-xs text-muted-foreground tabular">
            {hasPlanned ? (
              <>
                {money(totalSpent)} spent · {money(totalPlanned)} planned
              </>
            ) : (
              'spent this month'
            )}
          </div>
        </div>
        {/* Legend: always present for the two encodings */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-[2px] bg-bill" /> Spent
          </span>
          {hasPlanned && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-[2px] bg-bill/25" /> Planned
            </span>
          )}
          {rows.some((r) => r.limit) && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 rounded-full bg-foreground/50" /> Budget
            </span>
          )}
        </div>
      </div>

      <ul className="grid gap-3" aria-label="Spending by category">
        {rows.map((r, i) => {
          const over = r.limit !== undefined && r.spent > r.limit
          return (
            <li key={r.category}>
              <Tip delayDuration={150}>
                <TooltipTrigger asChild>
                  <div className="-mx-2 grid cursor-default gap-1.5 rounded-lg px-2 py-1 hover:bg-muted/50" tabIndex={0}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{r.category}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="text-xs text-muted-foreground tabular">{pct[i]}%</span>
                        <span className="font-medium tabular">{money(r.spent + r.planned)}</span>
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted">
                      <div className="absolute inset-y-0 left-0 flex gap-[2px] overflow-hidden rounded-full" style={{ width: pctOf(r.spent + r.planned) }}>
                        {r.spent > 0 && <div className={over ? 'bg-expense' : 'bg-bill'} style={{ flexGrow: r.spent, flexBasis: 0 }} />}
                        {r.planned > 0 && <div className="bg-bill/25" style={{ flexGrow: r.planned, flexBasis: 0 }} />}
                      </div>
                      {r.limit !== undefined && (
                        <div className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground/50" style={{ left: pctOf(r.limit) }} aria-hidden />
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="block">
                  <div className="font-medium">{r.category}</div>
                  <div className="tabular">Spent {money(r.spent)}</div>
                  {r.planned > 0 && <div className="tabular">Planned {money(r.planned)}</div>}
                  {r.limit !== undefined && (
                    <div className="tabular">
                      Budget {money(r.limit)} · {r.limit - r.spent >= 0 ? `${money(r.limit - r.spent)} left` : `${money(r.spent - r.limit)} over`}
                    </div>
                  )}
                  <div className="opacity-70">{pct[i]}% of this month</div>
                </TooltipContent>
              </Tip>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ForecastChart({ height = 260, days = 150, markDate }: { height?: number; days?: number; markDate?: string }) {
  const { data } = useStore()
  const series = useMemo(() => {
    const today = todayISO()
    const pts = forecastTimeline(data)
    const firstTx = data.transactions.filter(isDone).map((t) => t.completedOn ?? t.date).sort()[0]
    const start = firstTx && firstTx < today ? (firstTx < toISO(addDays(new Date(), -60)) ? toISO(addDays(new Date(), -60)) : firstTx) : today
    const end = [toISO(addDays(new Date(), days)), ...(markDate ? [toISO(addDays(parseISO(markDate), 20))] : [])].sort().at(-1)!
    const done = data.transactions.filter((t) => isDone(t) && affectsCash(t))
    const opening = data.accounts.reduce((a, x) => a + x.openingBalance, 0)
    const rows: { date: string; actual?: number; forecast?: number; events: string[] }[] = []
    let i = 0
    let fc = pts[0].balance
    for (let d = parseISO(start); toISO(d) <= end; d = addDays(d, 1)) {
      const iso = toISO(d)
      const events: string[] = []
      while (i < pts.length && pts[i].date <= iso) {
        fc = pts[i].balance
        if (pts[i].tx) events.push(`${pts[i].tx!.title} ${signed(pts[i].tx!) > 0 ? '+' : '−'}${money(pts[i].tx!.amount)}`)
        i++
      }
      const r: (typeof rows)[number] = { date: iso, events }
      if (iso <= today) r.actual = opening + done.filter((t) => (t.completedOn ?? t.date) <= iso).reduce((a, t) => a + signed(t), 0)
      if (iso >= today) r.forecast = fc
      rows.push(r)
    }
    return rows
  }, [data, days, markDate])

  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="g-fc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bill)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--bill)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-ac" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--income)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--income)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" ticks={series.filter((r) => r.date.endsWith('-01')).map((r) => r.date)} tickFormatter={(v) => format(parseISO(v), 'MMM')} interval={0} {...axis} />
          <YAxis tickFormatter={moneyCompact} width={48} {...axis} />
          <Tooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as (typeof series)[number]
              return (
                <TipBox>
                  <div className="font-medium">{format(parseISO(r.date), 'EEE, d MMM yyyy')}</div>
                  {r.actual !== undefined && <div className="text-income tabular">Actual {money(r.actual)}</div>}
                  {r.forecast !== undefined && <div className="text-bill tabular">Forecast {money(r.forecast)}</div>}
                  {r.events.map((e) => (
                    <div key={e} className="mt-0.5 truncate text-muted-foreground">
                      · {e}
                    </div>
                  ))}
                </TipBox>
              )
            }}
          />
          <ReferenceLine y={0} stroke="var(--expense)" strokeDasharray="4 4" />
          {markDate && <ReferenceLine x={markDate} stroke="var(--debt)" strokeDasharray="4 4" label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: 'var(--debt)' }} />}
          <Area type="stepAfter" dataKey="actual" stroke="var(--income)" strokeWidth={2} fill="url(#g-ac)" isAnimationActive={false} />
          <Area type="stepAfter" dataKey="forecast" stroke="var(--bill)" strokeWidth={2} fill="url(#g-fc)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

