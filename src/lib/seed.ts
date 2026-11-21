import { billTransactions, incomeTransactions } from './schedule'
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from './types'
import type { AppData, Bill, Debt, IncomeSource, Settings, Transaction } from './types'

const T0 = '2026-11-21T00:00:00.000Z'

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  currency: 'NPR',
  dateFormat: 'd MMM yyyy',
  theme: 'system',
  monthlyBudget: 0,
  budgetWarnPct: 80,
  includeOptionalInForecast: true,
  notifications: { enabled: true, upcomingDays: 7, budget: true, overdue: true, lowBalance: true },
  incomeCategories: [...DEFAULT_INCOME_CATEGORIES],
  expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
}

/** Blank workspace — no demo data. */
export function createEmpty(settings?: Settings): AppData {
  return {
    version: 1,
    isDemo: false,
    settings: settings ?? { ...DEFAULT_SETTINGS },
    accounts: [{ id: 'acc-main', name: 'Main account', openingBalance: 0 }],
    transactions: [],
    debts: [],
    bills: [],
    incomes: [],
    goals: [],
    budgets: {},
  }
}

const tx = (t: Omit<Transaction, 'createdAt' | 'accountId'>): Transaction => ({ accountId: 'acc-main', createdAt: T0, ...t })
const debt = (d: Omit<Debt, 'createdAt'>): Debt => ({ ...d, createdAt: T0 })

/**
 * Sample data — clearly flagged as demo (isDemo) and fully editable.
 * Nothing here is referenced by application logic.
 */
export function createDemo(): AppData {
  const salary: IncomeSource = {
    id: 'inc-salary',
    name: 'Salary',
    amount: 64000,
    frequency: 'monthly',
    firstDate: '2026-12-19',
    occurrences: 4,
    category: 'Salary',
    accountId: 'acc-main',
  }
  const salaryTx = incomeTransactions(salary).map((t, i) => (i === 0 ? { ...t, amount: 60000, notes: 'First month at Rs. 60,000' } : t))

  const tv: Bill = {
    id: 'bill-tv',
    name: 'Family TV EMI',
    kind: 'emi',
    amount: 0,
    frequency: 'monthly',
    firstDueDate: '2027-02-01',
    occurrences: 12,
    reminderDays: 3,
    category: 'Shopping',
    notes: '0% interest, 40% down payment. First installment date is editable.',
    emi: { price: 66800, downPayment: 26720, interestRate: 0, purchaseDate: '2027-01-01' },
  }
  const card: Bill = {
    id: 'bill-card',
    name: 'Nabil Bank credit card',
    kind: 'credit_card',
    amount: 60000,
    frequency: 'once',
    firstDueDate: '2027-01-16',
    occurrences: 1,
    reminderDays: 5,
    category: 'Other',
    notes: 'Full statement payment.',
  }

  return {
    version: 1,
    isDemo: true,
    settings: {
      ...DEFAULT_SETTINGS,
      monthlyBudget: 30000,
    },
    accounts: [{ id: 'acc-main', name: 'Main account', openingBalance: 74000 }],
    incomes: [salary],
    bills: [tv, card],
    debts: [
      debt({ id: 'debt-puskar', name: 'Puskar', originalAmount: 110000, frequency: 'once', dueDate: '2027-03-20', notes: 'Repay in one lump sum before the target date.' }),
      debt({ id: 'debt-dev', name: 'Dev', originalAmount: 46000, frequency: 'flexible', monthlyRepayment: 15000, dueDate: '2027-04-20', notes: 'Three payments of 15,000, then 1,000 after the target date.' }),
      debt({ id: 'debt-nitanta', name: 'Nitanta', originalAmount: 10000, frequency: 'once', dueDate: '2027-03-20', notes: 'Any date before the target.' }),
      debt({ id: 'debt-anish', name: 'Anish', originalAmount: 10000, frequency: 'once', dueDate: '2027-04-20', notes: 'Scheduled after the target date.' }),
    ],
    goals: [{ id: 'goal-emergency', name: 'Emergency fund', target: 50000, startingAmount: 0, targetDate: '2027-09-30', createdAt: T0 }],
    debtGoal: {
      title: 'Clear priority debts',
      targetDate: '2027-03-21',
      debtIds: ['debt-puskar', 'debt-dev', 'debt-nitanta', 'debt-anish'],
    },
    budgets: { Housing: 5000, Transport: 5000, 'Internet & Utilities': 17000, Food: 0 },
    transactions: [
      ...salaryTx,
      tx({ id: 'exp-internet', date: '2026-11-23', title: 'Internet bill', amount: 17000, kind: 'expense', category: 'Internet & Utilities', status: 'planned' }),
      tx({ id: 'exp-bike', date: '2026-11-28', title: 'Bike service', amount: 5000, kind: 'expense', category: 'Transport', status: 'planned' }),
      tx({ id: 'exp-house', date: '2026-11-30', title: 'House expenses', amount: 5000, kind: 'expense', category: 'Housing', status: 'planned', optional: true, notes: 'Optional — complete it if used, cancel it if not.' }),
      tx({ id: 'rep-dev-1', date: '2026-11-28', title: 'Dev — repayment', amount: 15000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-dev' }),
      tx({ id: 'rep-dev-2', date: '2027-01-22', title: 'Dev — repayment', amount: 15000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-dev' }),
      tx({ id: 'rep-dev-3', date: '2027-02-22', title: 'Dev — repayment', amount: 15000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-dev', notes: 'February or March.' }),
      tx({ id: 'rep-dev-4', date: '2027-04-20', title: 'Dev — final repayment', amount: 1000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-dev' }),
      tx({ id: 'rep-puskar', date: '2027-03-20', title: 'Puskar — lump-sum repayment', amount: 110000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-puskar' }),
      tx({ id: 'rep-nitanta', date: '2027-02-25', title: 'Nitanta — repayment', amount: 10000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-nitanta' }),
      tx({ id: 'rep-anish', date: '2027-04-20', title: 'Anish — repayment', amount: 10000, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: 'debt-anish' }),
      ...billTransactions(tv, 'acc-main'),
      ...billTransactions(card, 'acc-main'),
    ],
  }
}
