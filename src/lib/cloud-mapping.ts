/**
 * Mapping between the in-app AppData shape and the normalized Supabase tables.
 * Pure functions — no network. Each table row is keyed so we can diff and
 * send only inserts/updates/deletes.
 */
import type { Account, AppData, Bill, Debt, IncomeSource, SavingsGoal, Settings, Transaction } from './types'
import { DEFAULT_SETTINGS } from './seed'

type Row = Record<string, unknown>

/** Upsert order (parents before children). Deletes run in reverse. */
export const TABLES = ['profiles', 'user_settings', 'categories', 'accounts', 'debts', 'bills', 'income_sources', 'savings_goals', 'debt_goals', 'budgets', 'transactions'] as const
export type Table = (typeof TABLES)[number]

/** Primary-key columns (besides user_id) used to key rows and to build delete filters. */
export const PK: Record<Table, string[]> = {
  profiles: ['id'],
  user_settings: ['user_id'],
  categories: ['type', 'name'],
  accounts: ['id'],
  debts: ['id'],
  bills: ['id'],
  income_sources: ['id'],
  savings_goals: ['id'],
  debt_goals: ['user_id'],
  budgets: ['category'],
  transactions: ['id'],
}
/** Column that holds the owner's id (profiles uses id). */
export const OWNER: Record<Table, string> = { ...Object.fromEntries(TABLES.map((t) => [t, 'user_id'])), profiles: 'id' } as Record<Table, string>

export const rowKey = (t: Table, r: Row) => PK[t].map((c) => String(r[c])).join('|')

const n = <T,>(v: T | undefined | null) => (v === undefined ? null : v)
const b = (v: boolean | undefined) => !!v
const u = <T,>(v: T | null | undefined) => (v === null || v === undefined ? undefined : v)
const ub = (v: unknown) => (v ? true : undefined)
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v))
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : new Date().toISOString())

// ------------------------------------------------------------------ to rows

export function toRows(d: AppData, userId: string, email?: string): Record<Table, Row[]> {
  const s = d.settings
  return {
    profiles: [{ id: userId, email: n(email), display_name: s.name || null }],
    user_settings: [
      {
        user_id: userId,
        currency: s.currency,
        date_format: s.dateFormat,
        theme: s.theme,
        monthly_budget: s.monthlyBudget,
        budget_warn_pct: s.budgetWarnPct,
        include_optional_in_forecast: s.includeOptionalInForecast,
        notify_enabled: s.notifications.enabled,
        notify_upcoming_days: s.notifications.upcomingDays,
        notify_budget: s.notifications.budget,
        notify_overdue: s.notifications.overdue,
        notify_low_balance: s.notifications.lowBalance,
        is_demo: d.isDemo,
      },
    ],
    categories: [
      ...s.incomeCategories.map((name, i) => ({ user_id: userId, type: 'income', name, sort_order: i })),
      ...s.expenseCategories.map((name, i) => ({ user_id: userId, type: 'expense', name, sort_order: i })),
    ],
    accounts: d.accounts.map((a, i) => ({ user_id: userId, id: a.id, name: a.name, opening_balance: a.openingBalance, sort_order: i })),
    debts: d.debts.map((x) => ({
      user_id: userId,
      id: x.id,
      name: x.name,
      original_amount: x.originalAmount,
      interest_rate: n(x.interestRate),
      due_date: n(x.dueDate),
      monthly_repayment: n(x.monthlyRepayment),
      frequency: x.frequency,
      notes: n(x.notes),
      created_at: x.createdAt,
    })),
    bills: d.bills.map((x) => ({
      user_id: userId,
      id: x.id,
      name: x.name,
      kind: x.kind,
      amount: x.amount,
      frequency: x.frequency,
      first_due_date: x.firstDueDate,
      occurrences: x.occurrences,
      reminder_days: x.reminderDays,
      category: x.category,
      external: b(x.external),
      not_started: b(x.notStarted),
      notes: n(x.notes),
      emi_price: n(x.emi?.price),
      emi_down_payment: n(x.emi?.downPayment),
      emi_interest_rate: n(x.emi?.interestRate),
      emi_purchase_date: n(x.emi?.purchaseDate),
    })),
    income_sources: d.incomes.map((x) => ({
      user_id: userId,
      id: x.id,
      name: x.name,
      amount: x.amount,
      frequency: x.frequency,
      first_date: x.firstDate,
      occurrences: x.occurrences,
      category: x.category,
      account_id: n(x.accountId),
    })),
    savings_goals: d.goals.map((g) => ({
      user_id: userId,
      id: g.id,
      name: g.name,
      target: g.target,
      starting_amount: g.startingAmount,
      target_date: n(g.targetDate),
      created_at: g.createdAt,
    })),
    debt_goals: d.debtGoal ? [{ user_id: userId, title: d.debtGoal.title, target_date: d.debtGoal.targetDate, debt_ids: d.debtGoal.debtIds }] : [],
    budgets: Object.entries(d.budgets).map(([category, limit]) => ({ user_id: userId, category, monthly_limit: limit })),
    transactions: d.transactions.map((t) => ({
      user_id: userId,
      id: t.id,
      date: t.date,
      title: t.title,
      amount: t.amount,
      kind: t.kind,
      category: t.category,
      status: t.status,
      reserved: b(t.reserved),
      optional: b(t.optional),
      external: b(t.external),
      on_hold: b(t.onHold),
      account_id: t.accountId,
      to_account_id: n(t.toAccountId),
      debt_id: n(t.debtId),
      bill_id: n(t.billId),
      installment: n(t.installment),
      goal_id: n(t.goalId),
      income_id: n(t.incomeId),
      notes: n(t.notes),
      completed_on: n(t.completedOn),
      created_at: t.createdAt,
    })),
  }
}

/** Keyed JSON snapshot of every row — used for diffing and equality checks. */
export function snapshot(rows: Record<Table, Row[]>): Record<Table, Map<string, string>> {
  const out = {} as Record<Table, Map<string, string>>
  for (const t of TABLES) {
    const m = new Map<string, string>()
    for (const r of rows[t]) {
      // created_at is set once and may come back in a different format — leave it out of comparisons.
      const { created_at: _c, ...rest } = r
      void _c
      m.set(rowKey(t, r), JSON.stringify(rest, Object.keys(rest).sort()))
    }
    out[t] = m
  }
  return out
}

export function sameData(a: AppData, b2: AppData, userId: string) {
  const x = snapshot(toRows(a, userId))
  const y = snapshot(toRows(b2, userId))
  return TABLES.every((t) => x[t].size === y[t].size && [...x[t]].every(([k, v]) => y[t].get(k) === v))
}

/** Rows to upsert and keys to delete, per table, between the last synced snapshot and now. */
export function diff(prev: Record<Table, Map<string, string>> | null, rows: Record<Table, Row[]>) {
  const next = snapshot(rows)
  const upserts = {} as Record<Table, Row[]>
  const deletes = {} as Record<Table, string[]>
  for (const t of TABLES) {
    const p = prev?.[t] ?? new Map<string, string>()
    upserts[t] = rows[t].filter((r) => p.get(rowKey(t, r)) !== next[t].get(rowKey(t, r)))
    deletes[t] = [...p.keys()].filter((k) => !next[t].has(k))
  }
  return { upserts, deletes, next }
}

// ------------------------------------------------------------------ from rows

export function fromRows(r: Record<Table, Row[]>): AppData | null {
  const st = r.user_settings[0]
  if (!st) return null // nothing stored yet for this user
  const profile = r.profiles[0]
  const cats = (type: string) =>
    r.categories
      .filter((c) => c.type === type)
      .sort((a, b2) => Number(a.sort_order) - Number(b2.sort_order))
      .map((c) => String(c.name))
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    name: (profile?.display_name as string) ?? '',
    currency: st.currency as Settings['currency'],
    dateFormat: st.date_format as Settings['dateFormat'],
    theme: st.theme as Settings['theme'],
    monthlyBudget: Number(st.monthly_budget),
    budgetWarnPct: Number(st.budget_warn_pct),
    includeOptionalInForecast: !!st.include_optional_in_forecast,
    notifications: {
      enabled: !!st.notify_enabled,
      upcomingDays: Number(st.notify_upcoming_days),
      budget: !!st.notify_budget,
      overdue: !!st.notify_overdue,
      lowBalance: !!st.notify_low_balance,
    },
    incomeCategories: cats('income'),
    expenseCategories: cats('expense'),
  }
  const goal = r.debt_goals[0]
  return {
    version: 1,
    isDemo: !!st.is_demo,
    settings,
    accounts: [...r.accounts]
      .sort((a, b2) => Number(a.sort_order) - Number(b2.sort_order))
      .map((a): Account => ({ id: String(a.id), name: String(a.name), openingBalance: Number(a.opening_balance) })),
    debts: r.debts.map(
      (x): Debt => ({
        id: String(x.id),
        name: String(x.name),
        originalAmount: Number(x.original_amount),
        interestRate: num(x.interest_rate),
        dueDate: u(x.due_date as string | null),
        monthlyRepayment: num(x.monthly_repayment),
        frequency: x.frequency as Debt['frequency'],
        notes: u(x.notes as string | null),
        createdAt: iso(x.created_at),
      }),
    ),
    bills: r.bills.map(
      (x): Bill => ({
        id: String(x.id),
        name: String(x.name),
        kind: x.kind as Bill['kind'],
        amount: Number(x.amount),
        frequency: x.frequency as Bill['frequency'],
        firstDueDate: String(x.first_due_date),
        occurrences: Number(x.occurrences),
        reminderDays: Number(x.reminder_days),
        category: String(x.category),
        external: ub(x.external),
        notStarted: ub(x.not_started),
        notes: u(x.notes as string | null),
        emi:
          x.emi_price != null
            ? { price: Number(x.emi_price), downPayment: Number(x.emi_down_payment ?? 0), interestRate: Number(x.emi_interest_rate ?? 0), purchaseDate: String(x.emi_purchase_date) }
            : undefined,
      }),
    ),
    incomes: r.income_sources.map(
      (x): IncomeSource => ({
        id: String(x.id),
        name: String(x.name),
        amount: Number(x.amount),
        frequency: x.frequency as IncomeSource['frequency'],
        firstDate: String(x.first_date),
        occurrences: Number(x.occurrences),
        category: String(x.category),
        accountId: String(x.account_id ?? ''),
      }),
    ),
    goals: r.savings_goals.map(
      (g): SavingsGoal => ({
        id: String(g.id),
        name: String(g.name),
        target: Number(g.target),
        startingAmount: Number(g.starting_amount),
        targetDate: u(g.target_date as string | null),
        createdAt: iso(g.created_at),
      }),
    ),
    debtGoal: goal ? { title: String(goal.title), targetDate: String(goal.target_date), debtIds: (goal.debt_ids as string[]) ?? [] } : undefined,
    budgets: Object.fromEntries(r.budgets.map((x) => [String(x.category), Number(x.monthly_limit)])),
    transactions: r.transactions.map(
      (t): Transaction => ({
        id: String(t.id),
        date: String(t.date),
        title: String(t.title),
        amount: Number(t.amount),
        kind: t.kind as Transaction['kind'],
        category: String(t.category),
        status: t.status as Transaction['status'],
        reserved: ub(t.reserved),
        optional: ub(t.optional),
        external: ub(t.external),
        onHold: ub(t.on_hold),
        accountId: String(t.account_id),
        toAccountId: u(t.to_account_id as string | null),
        debtId: u(t.debt_id as string | null),
        billId: u(t.bill_id as string | null),
        installment: num(t.installment),
        goalId: u(t.goal_id as string | null),
        incomeId: u(t.income_id as string | null),
        notes: u(t.notes as string | null),
        completedOn: u(t.completed_on as string | null),
        createdAt: iso(t.created_at),
      }),
    ),
  }
}
