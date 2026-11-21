import { addFreq, uid } from './format'
import type { Bill, IncomeSource, Transaction } from './types'

const now = () => new Date().toISOString()

/** Standard amortised installment. 0% interest → simple split. */
export function emiCalc(price: number, downPayment: number, annualRatePct: number, months: number) {
  const financed = Math.max(0, price - downPayment)
  const r = annualRatePct / 12 / 100
  const monthly = months <= 0 ? 0 : r === 0 ? financed / months : (financed * r * (1 + r) ** months) / ((1 + r) ** months - 1)
  const rounded = Math.round(monthly)
  return { financed, monthly: rounded, totalPayable: rounded * months, totalInterest: Math.max(0, rounded * months - financed) }
}

export function billAmount(b: Bill) {
  return b.kind === 'emi' && b.emi ? emiCalc(b.emi.price, b.emi.downPayment, b.emi.interestRate, b.occurrences).monthly : b.amount
}

/** All payment transactions a bill implies (down payment = installment 0). */
export function billTransactions(b: Bill, accountId: string): Transaction[] {
  const out: Transaction[] = []
  const amount = billAmount(b)
  if (b.kind === 'emi' && b.emi && b.emi.downPayment > 0) {
    out.push({
      id: uid(),
      date: b.emi.purchaseDate,
      title: `${b.name} — down payment`,
      amount: b.emi.downPayment,
      kind: 'bill_payment',
      category: b.category,
      status: 'planned',
      billId: b.id,
      installment: 0,
      external: b.external,
      onHold: b.notStarted || undefined,
      accountId,
      createdAt: now(),
    })
  }
  const n = b.frequency === 'once' ? 1 : b.occurrences
  for (let i = 1; i <= n; i++) {
    out.push({
      id: uid(),
      date: addFreq(b.firstDueDate, b.frequency, i - 1),
      title: n > 1 ? `${b.name} ${i}/${n}` : b.name,
      amount,
      kind: 'bill_payment',
      category: b.category,
      status: 'planned',
      billId: b.id,
      installment: i,
      external: b.external,
      onHold: b.notStarted || undefined,
      accountId,
      createdAt: now(),
    })
  }
  return out
}

export function incomeTransactions(s: IncomeSource): Transaction[] {
  const n = s.frequency === 'once' ? 1 : s.occurrences
  return Array.from({ length: n }, (_, i) => ({
    id: uid(),
    date: addFreq(s.firstDate, s.frequency, i),
    title: s.name,
    amount: s.amount,
    kind: 'income' as const,
    category: s.category,
    status: 'planned' as const,
    incomeId: s.id,
    installment: i + 1,
    accountId: s.accountId,
    createdAt: now(),
  }))
}

/**
 * Merge a regenerated schedule with existing rows: completed/cancelled rows are kept untouched,
 * open rows take the new date/amount, extra open rows are dropped.
 */
export function mergeSchedule(existing: Transaction[], fresh: Transaction[], key: (t: Transaction) => number, keepAmounts = false): Transaction[] {
  const out: Transaction[] = []
  for (const f of fresh) {
    const ex = existing.find((e) => key(e) === key(f))
    if (!ex) out.push(f)
    else if (ex.status !== 'planned') out.push(ex)
    else out.push({ ...ex, date: f.date, amount: keepAmounts ? ex.amount : f.amount, title: f.title, category: f.category, external: f.external, onHold: f.onHold, accountId: f.accountId })
  }
  for (const ex of existing) if (ex.status === 'completed' && !fresh.some((f) => key(f) === key(ex))) out.push(ex)
  return out
}
