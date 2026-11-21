import { addDays, format, parseISO, subMonths } from 'date-fns'
import { daysUntil, fmtDate, money, todayISO, toISO } from './format'
import type { AppData, Bill, Debt, SavingsGoal, Transaction } from './types'

// ------------------------------------------------------------------ basics

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
export const isIncome = (t: Transaction) => t.kind === 'income'
export const isTransfer = (t: Transaction) => t.kind === 'transfer'
export const isOutflow = (t: Transaction) => !isIncome(t) && !isTransfer(t)
export const isSpending = (t: Transaction) => t.kind === 'expense' || t.kind === 'bill_payment'
/** Planned and active (not on hold) — what forecasts, reminders and totals use. */
export const isOpen = (t: Transaction) => t.status === 'planned' && !t.onHold
export const isDone = (t: Transaction) => t.status === 'completed'
/** Does this item move money in/out of the tracked accounts as a whole? */
export const affectsCash = (t: Transaction) => !t.external && !isTransfer(t)
export const signed = (t: Transaction) => (isIncome(t) ? t.amount : isTransfer(t) ? 0 : -t.amount)
/** Payments of a bill/EMI marked "not started yet" are hidden everywhere except the Bills & EMI page. */
export const isVisible = (t: Transaction) => !t.onHold
export const visibleTx = (d: AppData) => d.transactions.filter(isVisible)
export const isOverdue = (t: Transaction, today = todayISO()) => isOpen(t) && t.date < today
export const monthKey = (iso: string) => iso.slice(0, 7)

// ------------------------------------------------------------------ balances

export function accountBalance(d: AppData, accountId: string) {
  const acc = d.accounts.find((a) => a.id === accountId)
  let bal = acc?.openingBalance ?? 0
  for (const t of d.transactions) {
    if (!isDone(t) || t.external) continue
    if (t.kind === 'transfer') {
      if (t.accountId === accountId) bal -= t.amount
      if (t.toAccountId === accountId) bal += t.amount
    } else if (t.accountId === accountId) bal += signed(t)
  }
  return bal
}

/** Actual = opening balances + completed income − completed outflows. Planned items never count. */
export function actualBalance(d: AppData) {
  return sum(d.accounts.map((a) => a.openingBalance)) + sum(d.transactions.filter((t) => isDone(t) && affectsCash(t)).map(signed))
}

/** Actual balance at the end of a given day (completed items dated on/before it). */
export function balanceOn(d: AppData, iso: string) {
  return (
    sum(d.accounts.map((a) => a.openingBalance)) +
    sum(d.transactions.filter((t) => isDone(t) && affectsCash(t) && (t.completedOn ?? t.date) <= iso).map(signed))
  )
}

export function reservedTotal(d: AppData) {
  return sum(d.transactions.filter((t) => isOpen(t) && t.reserved && isOutflow(t) && !t.external).map((t) => t.amount))
}

export function forecastItems(d: AppData, includeOptional = d.settings.includeOptionalInForecast) {
  return d.transactions.filter((t) => isOpen(t) && affectsCash(t) && (includeOptional || !t.optional)).sort(byDate)
}

export interface ForecastPoint {
  date: string
  balance: number
  tx?: Transaction
}

/** Running forecast from today; overdue open items are treated as due today. */
export function forecastTimeline(d: AppData, includeOptional?: boolean): ForecastPoint[] {
  const today = todayISO()
  let bal = actualBalance(d)
  const pts: ForecastPoint[] = [{ date: today, balance: bal }]
  for (const t of forecastItems(d, includeOptional)) {
    bal += signed(t)
    pts.push({ date: t.date < today ? today : t.date, balance: bal, tx: t })
  }
  return pts
}

export function forecastAt(pts: ForecastPoint[], iso: string) {
  let b = pts[0]?.balance ?? 0
  for (const p of pts) if (p.date <= iso) b = p.balance
  return b
}

export function cashSummary(d: AppData) {
  const actual = actualBalance(d)
  const reserved = reservedTotal(d)
  const pts = forecastTimeline(d)
  const min = pts.reduce((m, p) => (p.balance < m.balance ? p : m), pts[0])
  return { actual, reserved, available: actual - reserved, forecastEnd: pts[pts.length - 1].balance, min, pts }
}

/** Opening + expected income − planned outflows = projected closing, month by month from now. */
export function monthlyProjection(d: AppData, months = 6) {
  const today = todayISO()
  const items = forecastItems(d)
  let opening = actualBalance(d)
  const rows: { month: string; opening: number; income: number; outflow: number; closing: number; count: number }[] = []
  const start = parseISO(`${monthKey(today)}-01`)
  for (let i = 0; i < months; i++) {
    const m = format(new Date(start.getFullYear(), start.getMonth() + i, 1), 'yyyy-MM')
    const inMonth = items.filter((t) => (i === 0 ? monthKey(t.date) <= m : monthKey(t.date) === m))
    const income = sum(inMonth.filter(isIncome).map((t) => t.amount))
    const outflow = sum(inMonth.filter(isOutflow).map((t) => t.amount))
    const closing = opening + income - outflow
    rows.push({ month: m, opening, income, outflow, closing, count: inMonth.length })
    opening = closing
  }
  return rows
}

// ------------------------------------------------------------------ months

export function monthStats(d: AppData, month: string) {
  const inMonth = d.transactions.filter((t) => monthKey(t.date) === month && !t.external)
  const done = inMonth.filter(isDone)
  const income = sum(done.filter(isIncome).map((t) => t.amount))
  const expectedIncome = sum(inMonth.filter((t) => isIncome(t) && isOpen(t)).map((t) => t.amount))
  const spending = sum(done.filter(isSpending).map((t) => t.amount))
  const plannedSpending = sum(inMonth.filter((t) => isSpending(t) && isOpen(t)).map((t) => t.amount))
  const debtPaid = sum(done.filter((t) => t.kind === 'debt_payment').map((t) => t.amount))
  const saved = sum(done.filter((t) => t.kind === 'savings').map((t) => t.amount))
  const byCategory: Record<string, number> = {}
  for (const t of done.filter(isSpending)) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount
  return { income, expectedIncome, spending, plannedSpending, debtPaid, saved, byCategory, net: income - spending - debtPaid }
}

export function monthsRange(fromIso: string, toIso: string) {
  const out: string[] = []
  const s = parseISO(`${monthKey(fromIso)}-01`)
  const e = parseISO(`${monthKey(toIso)}-01`)
  for (let c = s; c <= e; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) out.push(format(c, 'yyyy-MM'))
  return out
}

/** Months that have any data, plus the current month. */
export function activeMonths(d: AppData) {
  const ks = d.transactions.filter((t) => !t.onHold).map((t) => t.date)
  const min = [todayISO(), ...ks].sort()[0]
  const max = [todayISO(), ...ks].sort().at(-1)!
  return monthsRange(min, max)
}

// ------------------------------------------------------------------ budgets

export type BudgetState = 'ok' | 'warn' | 'over' | 'none'

export function budgetStatus(d: AppData, month: string) {
  const st = monthStats(d, month)
  const cats = Array.from(new Set([...d.settings.expenseCategories, ...Object.keys(d.budgets), ...Object.keys(st.byCategory)]))
  const warn = d.settings.budgetWarnPct / 100
  const rows = cats.map((c) => {
    const limit = d.budgets[c] ?? 0
    const spent = st.byCategory[c] ?? 0
    const pct = limit ? spent / limit : spent ? Infinity : 0
    const state: BudgetState = !limit ? 'none' : pct > 1 ? 'over' : pct >= warn ? 'warn' : 'ok'
    return { category: c, limit, spent, remaining: limit - spent, pct, state }
  })
  const limitTotal = d.settings.monthlyBudget || sum(rows.map((r) => r.limit))
  const pct = limitTotal ? st.spending / limitTotal : 0
  const state: BudgetState = !limitTotal ? 'none' : pct > 1 ? 'over' : pct >= warn ? 'warn' : 'ok'
  return { rows, limitTotal, spent: st.spending, remaining: limitTotal - st.spending, pct, state }
}

// ------------------------------------------------------------------ debts

export type DebtStatus = 'paid-off' | 'in-progress' | 'not-started' | 'overdue'

export function debtStats(d: AppData, debt: Debt) {
  const txs = d.transactions.filter((t) => t.debtId === debt.id && t.kind === 'debt_payment').sort(byDate)
  const history = txs.filter(isDone)
  const planned = txs.filter(isOpen)
  const repaid = sum(history.map((t) => t.amount))
  const outstanding = Math.max(0, debt.originalAmount - repaid)
  const plannedTotal = sum(planned.map((t) => t.amount))
  const next = planned[0]
  let status: DebtStatus = outstanding === 0 ? 'paid-off' : repaid > 0 ? 'in-progress' : 'not-started'
  if (status !== 'paid-off' && next && isOverdue(next)) status = 'overdue'
  const monthlyInterest = debt.interestRate ? (outstanding * debt.interestRate) / 100 / 12 : 0
  return { debt, history, planned, repaid, outstanding, plannedTotal, unscheduled: Math.max(0, outstanding - plannedTotal), next, status, monthlyInterest, pct: debt.originalAmount ? repaid / debt.originalAmount : 0 }
}
export type DebtStats = ReturnType<typeof debtStats>

export function debtSummary(d: AppData) {
  const stats = d.debts.map((x) => debtStats(d, x))
  const total = sum(d.debts.map((x) => x.originalAmount))
  const repaid = sum(stats.map((s) => Math.min(s.repaid, s.debt.originalAmount)))
  const remaining = sum(stats.map((s) => s.outstanding))
  const upcoming = d.transactions.filter((t) => t.kind === 'debt_payment' && isOpen(t)).sort(byDate)
  return { stats, total, repaid, remaining, pct: total ? repaid / total : 0, upcoming }
}

/**
 * Debt-payoff goal: repayments planned on or before the target date form the "priority" portion;
 * whatever is planned after it (or not planned at all) is kept separate.
 */
export function debtGoalProgress(d: AppData) {
  const g = d.debtGoal
  if (!g) return undefined
  const ids = new Set(g.debtIds)
  const stats = d.debts.filter((x) => ids.has(x.id)).map((x) => debtStats(d, x))
  const repaid = sum(stats.map((s) => s.repaid))
  const plannedBefore = sum(stats.flatMap((s) => s.planned.filter((t) => t.date <= g.targetDate).map((t) => t.amount)))
  const plannedAfter = sum(stats.flatMap((s) => s.planned.filter((t) => t.date > g.targetDate).map((t) => t.amount)))
  const outstanding = sum(stats.map((s) => s.outstanding))
  const unscheduled = Math.max(0, outstanding - plannedBefore - plannedAfter)
  const priorityTotal = repaid + plannedBefore
  const pts = forecastTimeline(d).filter((p) => p.date <= g.targetDate)
  const minBefore = Math.min(...pts.map((p) => p.balance))
  const priorityDone = plannedBefore === 0
  return {
    goal: g,
    stats,
    repaid,
    plannedBefore,
    plannedAfter,
    unscheduled,
    outstanding,
    priorityTotal,
    pct: priorityTotal ? repaid / priorityTotal : 0,
    affordable: minBefore >= 0,
    minBefore,
    balanceAtTarget: forecastAt(forecastTimeline(d), g.targetDate),
    priorityDone,
    fullyFree: outstanding === 0,
    daysLeft: daysUntil(g.targetDate),
    perDebt: stats.map((s) => ({
      name: s.debt.name,
      before: sum(s.planned.filter((t) => t.date <= g.targetDate).map((t) => t.amount)),
      after: sum(s.planned.filter((t) => t.date > g.targetDate).map((t) => t.amount)) + s.unscheduled,
    })),
  }
}

// ------------------------------------------------------------------ bills

export function billStats(d: AppData, bill: Bill) {
  const txs = d.transactions.filter((t) => t.billId === bill.id).sort((a, b) => (a.installment ?? 0) - (b.installment ?? 0))
  const down = txs.find((t) => t.installment === 0)
  const inst = txs.filter((t) => (t.installment ?? 1) > 0 && t.status !== 'cancelled')
  const paid = inst.filter(isDone)
  const open = inst.filter((t) => t.status === 'planned').sort(byDate)
  const next = open[0]
  const reminderDue = !bill.notStarted && next ? daysUntil(next.date) <= bill.reminderDays : false
  const startDate = bill.emi?.purchaseDate ?? bill.firstDueDate
  const started = !bill.notStarted && (paid.length > 0 || down?.status === 'completed' || startDate <= todayISO())
  const phase: 'on-hold' | 'not-started' | 'active' | 'done' = bill.notStarted ? 'on-hold' : !open.length && !(down && down.status === 'planned') ? 'done' : started ? 'active' : 'not-started'
  return {
    txs,
    down,
    installments: inst,
    paidCount: paid.length,
    remainingCount: open.length,
    remainingAmount: sum(open.map((t) => t.amount)),
    paidAmount: sum(paid.map((t) => t.amount)),
    total: sum(inst.map((t) => t.amount)) + (down?.amount ?? 0),
    next,
    reminderDue,
    phase,
    startDate,
  }
}

// ------------------------------------------------------------------ savings

export function goalStats(d: AppData, g: SavingsGoal) {
  const txs = d.transactions.filter((t) => t.goalId === g.id && t.kind === 'savings').sort(byDate)
  const contributions = txs.filter(isDone)
  const planned = txs.filter(isOpen)
  const saved = g.startingAmount + sum(contributions.map((t) => t.amount))
  const remaining = Math.max(0, g.target - saved)
  const days = g.targetDate ? daysUntil(g.targetDate) : undefined
  const monthsLeft = days !== undefined ? Math.max(1, Math.ceil(days / 30.4)) : undefined
  return { goal: g, contributions, planned, saved, remaining, pct: g.target ? Math.min(1, saved / g.target) : 0, perMonth: monthsLeft ? remaining / monthsLeft : undefined, days }
}

export function totalSavings(d: AppData) {
  return sum(d.goals.map((g) => goalStats(d, g).saved))
}

// ------------------------------------------------------------------ upcoming & alerts

export function upcoming(d: AppData, withinDays?: number) {
  const limit = withinDays !== undefined ? toISO(addDays(new Date(), withinDays)) : '9999-12-31'
  return d.transactions.filter((t) => isOpen(t) && isOutflow(t) && t.date <= limit).sort(byDate)
}

export interface Alert {
  id: string
  tone: 'danger' | 'warning' | 'info'
  title: string
  detail: string
  txId?: string
  route?: string
}

export function alerts(d: AppData): Alert[] {
  const n = d.settings.notifications
  const out: Alert[] = []
  const today = todayISO()
  if (n.overdue)
    for (const t of d.transactions.filter((t) => isOverdue(t, today)))
      out.push({ id: `od-${t.id}`, tone: 'danger', title: `Overdue: ${t.title}`, detail: `${money(t.amount)} was due ${fmtDate(t.date)}.`, txId: t.id })
  if (n.lowBalance) {
    const pts = forecastTimeline(d)
    const neg = pts.find((p) => p.balance < 0 && p.tx)
    if (neg)
      out.push({
        id: `low-${neg.tx!.id}`,
        tone: 'danger',
        title: `Projected shortfall on ${fmtDate(neg.date)}`,
        detail: `"${neg.tx!.title}" takes your forecast to ${money(neg.balance)}.`,
        txId: neg.tx!.id,
        route: 'cashflow',
      })
  }
  if (n.budget) {
    const b = budgetStatus(d, monthKey(today))
    for (const r of b.rows.filter((r) => r.state === 'over' || r.state === 'warn'))
      out.push({
        id: `bud-${r.category}`,
        tone: r.state === 'over' ? 'danger' : 'warning',
        title: r.state === 'over' ? `${r.category} is over budget` : `${r.category} is at ${Math.round(r.pct * 100)}% of budget`,
        detail: `${money(r.spent)} spent of ${money(r.limit)} this month.`,
        route: 'budget',
      })
  }
  if (n.enabled) {
    for (const t of upcoming(d, n.upcomingDays).filter((t) => t.date >= today))
      out.push({ id: `up-${t.id}`, tone: 'warning', title: `${t.title} due ${daysUntil(t.date) === 0 ? 'today' : `in ${daysUntil(t.date)} days`}`, detail: `${money(t.amount)} on ${fmtDate(t.date)}.`, txId: t.id })
    for (const b of d.bills) {
      const s = billStats(d, b)
      if (s.next && s.reminderDue && !s.next.onHold && daysUntil(s.next.date) > n.upcomingDays)
        out.push({ id: `rem-${s.next.id}`, tone: 'info', title: `Reminder: ${s.next.title}`, detail: `${money(s.next.amount)} due ${fmtDate(s.next.date)}.`, txId: s.next.id })
    }
  }
  return out
}

// ------------------------------------------------------------------ insights

export interface Insight {
  id: string
  tone: 'positive' | 'negative' | 'neutral'
  text: string
}

/** Data-driven observations only — each insight is skipped when the data doesn't support it. */
export function insights(d: AppData, month = monthKey(todayISO())): Insight[] {
  const out: Insight[] = []
  const cur = monthStats(d, month)
  const prevKey = format(subMonths(parseISO(`${month}-01`), 1), 'yyyy-MM')
  const prev = monthStats(d, prevKey)
  const mName = format(parseISO(`${month}-01`), 'MMMM')

  // category change vs last month
  for (const [cat, amt] of Object.entries(cur.byCategory)) {
    const before = prev.byCategory[cat] ?? 0
    if (before > 0) {
      const change = (amt - before) / before
      if (Math.abs(change) >= 0.1)
        out.push({
          id: `chg-${cat}`,
          tone: change > 0 ? 'negative' : 'positive',
          text: `You spent ${Math.round(Math.abs(change) * 100)}% ${change > 0 ? 'more' : 'less'} on ${cat.toLowerCase()} this month (${money(amt)} vs ${money(before)}).`,
        })
    }
  }
  if (cur.spending > 0 && prev.spending > 0) {
    const ch = (cur.spending - prev.spending) / prev.spending
    if (Math.abs(ch) >= 0.05)
      out.push({ id: 'total-chg', tone: ch > 0 ? 'negative' : 'positive', text: `Total spending is ${Math.round(Math.abs(ch) * 100)}% ${ch > 0 ? 'higher' : 'lower'} than last month.` })
  }
  // biggest category
  const top = Object.entries(cur.byCategory).sort((a, b) => b[1] - a[1])[0]
  if (top && cur.spending > 0)
    out.push({ id: 'top', tone: 'neutral', text: `Your biggest spending category in ${mName} is ${top[0].toLowerCase()} — ${money(top[1])}, ${Math.round((top[1] / cur.spending) * 100)}% of spending.` })
  // net / saved
  if (cur.income > 0) {
    out.push(
      cur.net >= 0
        ? { id: 'net', tone: 'positive', text: `You kept ${money(cur.net)} of this month's ${money(cur.income)} income after spending and debt payments.` }
        : { id: 'net', tone: 'negative', text: `You spent ${money(-cur.net)} more than you earned this month.` },
    )
  }
  if (cur.saved > 0) out.push({ id: 'saved', tone: 'positive', text: `You moved ${money(cur.saved)} into savings goals this month.` })
  // upcoming
  const up = upcoming(d, 30)
  if (up.length)
    out.push({ id: 'up', tone: 'neutral', text: `You have ${up.length} upcoming payment${up.length > 1 ? 's' : ''} in the next 30 days, totalling ${money(sum(up.map((t) => t.amount)))}.` })
  // debt progress
  const ds = debtSummary(d)
  if (ds.total > 0 && ds.repaid > 0) out.push({ id: 'debt', tone: 'positive', text: `You have reduced your total debt by ${Math.round(ds.pct * 100)}% (${money(ds.repaid)} repaid).` })
  else if (ds.total > 0) out.push({ id: 'debt0', tone: 'neutral', text: `No debt repayments completed yet — ${money(ds.remaining)} outstanding across ${d.debts.length} debt${d.debts.length > 1 ? 's' : ''}.` })
  // budget
  const b = budgetStatus(d, month)
  const over = b.rows.filter((r) => r.state === 'over')
  if (over.length) out.push({ id: 'over', tone: 'negative', text: `${over.map((r) => r.category).join(', ')} ${over.length > 1 ? 'are' : 'is'} over budget this month.` })
  // forecast
  const cash = cashSummary(d)
  if (cash.min.balance < 0 && cash.min.tx)
    out.push({ id: 'short', tone: 'negative', text: `Your forecast dips to ${money(cash.min.balance)} on ${fmtDate(cash.min.date)} after "${cash.min.tx.title}".` })
  else if (cash.pts.length > 1)
    out.push({ id: 'low', tone: 'neutral', text: `Your lowest projected balance is ${money(cash.min.balance)} on ${fmtDate(cash.min.date)}.` })
  // pending income
  if (cur.expectedIncome > 0) out.push({ id: 'pending', tone: 'neutral', text: `${money(cur.expectedIncome)} of income is still expected this month.` })
  return out
}
