import { ArrowDownLeft, CalendarClock, HandCoins, Info, Lightbulb, PiggyBank, Receipt, TrendingDown, TrendingUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Bar, Empty, Panel, Stat } from '@/components/app/page'
import { TxRow } from '@/components/app/tx-row'
import { CategoryBars, IncomeExpenseChart } from '@/components/app/charts'
import { useTx, QUICK_ACTIONS } from '@/components/app/tx-dialogs'
import { KIND_STYLE } from '@/components/app/badges'
import { useStore } from '@/lib/store'
import {
  balanceOn,
  budgetStatus,
  cashSummary,
  debtGoalProgress,
  debtSummary,
  forecastAt,
  goalStats,
  insights,
  isSpending,
  monthKey,
  monthStats,
  totalSavings,
  upcoming,
} from '@/lib/finance'
import { addDays, subDays, parseISO } from 'date-fns'
import { fmt, money, todayISO, toISO } from '@/lib/format'
import { go } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { TxKind } from '@/lib/types'

export function DashboardPage() {
  const { data } = useStore()
  const { openNew } = useTx()
  const month = monthKey(todayISO())
  const cash = cashSummary(data)
  const in90 = forecastAt(cash.pts, toISO(addDays(new Date(), 90)))
  // Change since the start of this month (balance at the end of last month → now)
  const monthChange = cash.actual - balanceOn(data, toISO(subDays(parseISO(`${monthKey(todayISO())}-01`), 1)))
  const low = cash.min
  const ms = monthStats(data, month)
  const debt = debtSummary(data)
  const dg = debtGoalProgress(data)
  const up30 = upcoming(data, 30)
  const upAll = upcoming(data)
  const budget = budgetStatus(data, month)
  const recent = [...data.transactions]
    .filter((t) => t.status === 'completed')
    .sort((a, b) => (b.completedOn ?? b.date).localeCompare(a.completedOn ?? a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
  const tips = insights(data).slice(0, 3)
  const planned: Record<string, number> = {}
  for (const t of data.transactions.filter((t) => monthKey(t.date) === month && t.status === 'planned' && !t.onHold && isSpending(t) && !t.external)) planned[t.category] = (planned[t.category] ?? 0) + t.amount
  const hasSpent = Object.keys(ms.byCategory).length > 0
  const hour = new Date().getHours()
  const hello = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}${data.settings.name ? `, ${data.settings.name}` : ''}`
  const quick = (kind: TxKind) =>
    openNew({ kind, status: 'completed', ...(kind === 'debt_payment' ? { category: 'Debt' } : kind === 'savings' ? { category: 'Savings' } : kind === 'transfer' ? { category: 'Transfer' } : {}) })

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm text-muted-foreground">{fmt(todayISO(), 'EEEE, d MMMM')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{hello}</h1>
      </div>

      {/* Balance card: the balance, where it's heading, and the actions that change it */}
      <section className="overflow-hidden rounded-2xl bg-hero text-hero-fg ring-1 ring-white/5" aria-label="Balance">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-hero-fg/60">
              Total balance
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <button type="button" className="rounded-full text-hero-fg/50 hover:text-hero-fg" aria-label="How the balance is calculated">
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-64">
                  Counts completed transactions only. Planned items affect the forecast, never your balance.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-1 text-4xl font-semibold tracking-tight tabular sm:text-5xl">{money(cash.actual)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular',
                  monthChange > 0 ? 'bg-hero-up/15 text-hero-up' : monthChange < 0 ? 'bg-hero-down/15 text-hero-down' : 'bg-hero-fg/10 text-hero-fg/70',
                )}
              >
                {monthChange > 0 ? <TrendingUp className="size-3" /> : monthChange < 0 ? <TrendingDown className="size-3" /> : null}
                {monthChange === 0 ? 'No change' : money(monthChange, { sign: true })}
              </span>
              <span className="text-hero-fg/50">since {fmt(`${month}-01`, 'd MMM')}</span>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-4 border-t border-hero-fg/10 pt-4 text-xs lg:gap-0 lg:border-t-0 lg:pt-0 lg:[&>div]:border-l lg:[&>div]:border-hero-fg/10 lg:[&>div]:px-6 lg:[&>div:last-child]:pr-0">
            <div>
              <dt className="text-hero-fg/60">Available</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular lg:text-base">{money(cash.available)}</dd>
              {cash.reserved > 0 && <dd className="text-[11px] text-reserved tabular">{money(cash.reserved)} reserved</dd>}
            </div>
            <div>
              <dt className="text-hero-fg/60">In 90 days</dt>
              <dd className={cn('mt-0.5 text-sm font-semibold tabular lg:text-base', in90 < 0 && 'text-hero-down')}>{money(in90)}</dd>
              <dd className="text-[11px] text-hero-fg/50 tabular">{money(in90 - cash.actual, { sign: true })}</dd>
            </div>
            <div>
              <dt className="text-hero-fg/60">Lowest ahead</dt>
              <dd className={cn('mt-0.5 text-sm font-semibold tabular lg:text-base', low.balance < 0 && 'text-hero-down')}>{money(low.balance)}</dd>
              <dd className="text-[11px] text-hero-fg/50">{fmt(low.date, 'd MMM')}</dd>
            </div>
          </dl>
        </div>

        {/* Quick actions — a compact toolbar instead of a column of large buttons */}
        <div className="grid grid-cols-5 border-t border-hero-fg/10 sm:flex sm:flex-wrap sm:gap-1.5 sm:px-5 sm:py-3">
          {QUICK_ACTIONS.map((q) => {
            const s = KIND_STYLE[q.kind]
            const Icon = s.icon
            return (
              <button
                type="button"
                key={q.kind}
                onClick={() => quick(q.kind)}
                className="pressable flex flex-col items-center gap-1 px-1 py-3 text-[11px] font-medium text-hero-fg/80 hover:bg-hero-fg/8 hover:text-hero-fg sm:flex-row sm:gap-2 sm:rounded-full sm:bg-hero-fg/6 sm:py-1.5 sm:pr-3.5 sm:pl-1.5 sm:text-sm"
              >
                <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5', s.chip)}>
                  <Icon />
                </span>
                <span className="leading-tight">{q.label.replace('Add ', '').replace(' money', '').replace(/^./, (c) => c.toUpperCase())}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Key metrics (total balance lives in the hero above) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Monthly income" value={money(ms.income)} tone="income" icon={<ArrowDownLeft />} hint={ms.expectedIncome ? `+${money(ms.expectedIncome)} expected` : `Received in ${fmt(todayISO(), 'MMMM')}`} />
        <Stat label="Monthly expenses" value={money(ms.spending)} tone="expense" icon={<Receipt />} hint={ms.plannedSpending ? `+${money(ms.plannedSpending)} planned` : `Spent in ${fmt(todayISO(), 'MMMM')}`} />
        <Stat label="Total savings" value={money(totalSavings(data))} tone="saving" icon={<PiggyBank />} hint={`${data.goals.length} goal${data.goals.length === 1 ? '' : 's'}`} />
        <Stat label="Outstanding debt" value={money(debt.remaining)} tone="debt" icon={<HandCoins />} hint={debt.total ? `${Math.round(debt.pct * 100)}% of ${money(debt.total)} repaid` : 'No debts'} />
        <Stat className="col-span-2 md:col-span-1" label="Upcoming payments" value={money(up30.reduce((a, t) => a + t.amount, 0))} tone="upcoming" icon={<CalendarClock />} hint={`${up30.length} in the next 30 days`} />
      </div>

      {tips.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Lightbulb className="size-4 text-upcoming" /> Insights
            </span>
          }
          action={
            <Button variant="ghost" size="sm" onClick={() => go('insights')}>
              All insights
            </Button>
          }
        >
          <ul className="grid gap-2 sm:grid-cols-3">
            {tips.map((t) => (
              <li key={t.id} className={cn('rounded-xl p-3 text-sm', t.tone === 'positive' ? 'bg-income-soft' : t.tone === 'negative' ? 'bg-expense-soft' : 'bg-muted/60')}>
                {t.text}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Income vs. expenses" description="Solid = completed · faded = still expected or planned">
          <IncomeExpenseChart />
        </Panel>
        <Panel title="Spending by category" description={`${fmt(todayISO(), 'MMMM')} · completed and still planned`}>
          {hasSpent || Object.keys(planned).length ? <CategoryBars spent={ms.byCategory} planned={planned} budgets={data.budgets} /> : <Empty>No spending this month.</Empty>}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Upcoming bills & payments"
          description={`${upAll.length} planned · ${money(upAll.reduce((a, t) => a + t.amount, 0))}`}
          action={
            <Button variant="ghost" size="sm" onClick={() => go('cashflow')}>
              Calendar
            </Button>
          }
          bodyClassName="px-3"
        >
          {upAll.length ? upAll.slice(0, 6).map((t) => <TxRow key={t.id} tx={t} rel />) : <Empty>Nothing coming up.</Empty>}
        </Panel>
        <Panel
          title="Recent transactions"
          action={
            <Button variant="ghost" size="sm" onClick={() => go('transactions')}>
              View all
            </Button>
          }
          bodyClassName="px-3"
        >
          {recent.length ? recent.map((t) => <TxRow key={t.id} tx={t} />) : <Empty>No completed transactions yet. Mark a planned item complete, or add one with the buttons above.</Empty>}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Monthly budget"
          description={budget.limitTotal ? `${money(budget.spent)} of ${money(budget.limitTotal)}` : 'No budget set'}
          action={
            <Button variant="ghost" size="sm" onClick={() => go('budget')}>
              Edit
            </Button>
          }
        >
          {budget.limitTotal ? (
            <div className="grid gap-3">
              <Bar value={budget.pct} tone={budget.state === 'over' ? 'expense' : budget.state === 'warn' ? 'upcoming' : 'income'} className="h-2" />
              {budget.rows
                .filter((r) => r.limit > 0)
                .slice(0, 4)
                .map((r) => (
                  <div key={r.category}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{r.category}</span>
                      <span className={cn('tabular', r.state === 'over' ? 'text-expense' : 'text-muted-foreground')}>
                        {money(r.spent)} / {money(r.limit)}
                      </span>
                    </div>
                    <Bar value={r.pct} tone={r.state === 'over' ? 'expense' : r.state === 'warn' ? 'upcoming' : 'income'} />
                  </div>
                ))}
            </div>
          ) : (
            <Empty>Set spending limits to track your month.</Empty>
          )}
        </Panel>

        <Panel
          title="Savings goals"
          action={
            <Button variant="ghost" size="sm" onClick={() => go('savings')}>
              Manage
            </Button>
          }
        >
          {data.goals.length ? (
            <div className="grid gap-4">
              {data.goals.slice(0, 3).map((g) => {
                const s = goalStats(data, g)
                return (
                  <div key={g.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-xs text-muted-foreground tabular">{Math.round(s.pct * 100)}%</span>
                    </div>
                    <Bar value={s.pct} tone="saving" />
                    <div className="mt-1 text-xs text-muted-foreground tabular">
                      {money(s.saved)} of {money(g.target)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>No savings goals yet.</Empty>
          )}
        </Panel>

        <Panel
          title={dg ? dg.goal.title : 'Debt repayment'}
          description={dg ? `Target ${fmt(dg.goal.targetDate, 'd MMM yyyy')} · ${Math.max(0, dg.daysLeft)} days left` : undefined}
          action={
            <Button variant="ghost" size="sm" onClick={() => go('debts')}>
              Debts
            </Button>
          }
        >
          {dg ? (
            <div className="grid gap-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular">{Math.round(dg.pct * 100)}%</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', dg.priorityDone ? 'bg-income-soft text-income' : dg.affordable ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense')}>
                  {dg.priorityDone ? 'Target met' : dg.affordable ? 'On track' : 'Cash shortfall'}
                </span>
              </div>
              <Bar value={dg.pct} tone="debt" className="h-2" />
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Due by target</dt>
                  <dd className="text-sm font-semibold tabular">{money(dg.plannedBefore)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">After target</dt>
                  <dd className="text-sm font-semibold tabular">{money(dg.plannedAfter + dg.unscheduled)}</dd>
                </div>
              </dl>
            </div>
          ) : debt.total ? (
            <div className="grid gap-2">
              <Bar value={debt.pct} tone="debt" className="h-2" />
              <div className="text-xs text-muted-foreground">
                {money(debt.repaid)} repaid · {money(debt.remaining)} left
              </div>
            </div>
          ) : (
            <Empty>No debts — nice.</Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}
