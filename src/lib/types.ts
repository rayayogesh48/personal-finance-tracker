export type TxStatus = 'completed' | 'planned' | 'cancelled'

export type TxKind = 'income' | 'expense' | 'transfer' | 'debt_payment' | 'bill_payment' | 'savings'

export type Frequency = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Transaction {
  id: string
  /** yyyy-MM-dd — when it happened / is expected */
  date: string
  title: string
  amount: number
  kind: TxKind
  category: string
  status: TxStatus
  /** Planned outflow with cash already set aside */
  reserved?: boolean
  /** Optional planned expense — can be excluded from the forecast */
  optional?: boolean
  /** Paid from money outside the tracked accounts (never affects balance or forecast) */
  external?: boolean
  /** Belongs to a bill/EMI that hasn't started yet — ignored by forecasts, reminders and totals */
  onHold?: boolean
  accountId: string
  toAccountId?: string
  debtId?: string
  billId?: string
  /** 0 = down payment, 1..n = installment number */
  installment?: number
  goalId?: string
  incomeId?: string
  notes?: string
  completedOn?: string
  createdAt: string
}

export interface Account {
  id: string
  name: string
  openingBalance: number
}

export interface Debt {
  id: string
  name: string
  originalAmount: number
  interestRate?: number
  dueDate?: string
  monthlyRepayment?: number
  frequency: Frequency | 'flexible'
  notes?: string
  createdAt: string
}

export type BillKind = 'credit_card' | 'emi' | 'internet' | 'rent' | 'subscription' | 'insurance' | 'other'

export interface Bill {
  id: string
  name: string
  kind: BillKind
  /** Amount of each payment (derived for EMI) */
  amount: number
  frequency: Frequency
  firstDueDate: string
  /** Number of payments to schedule */
  occurrences: number
  reminderDays: number
  category: string
  external?: boolean
  /** Plan exists but hasn't begun (e.g. not bought yet) — its payments stay out of forecasts until started */
  notStarted?: boolean
  notes?: string
  emi?: {
    price: number
    downPayment: number
    interestRate: number
    purchaseDate: string
  }
}

export interface IncomeSource {
  id: string
  name: string
  amount: number
  frequency: Frequency
  firstDate: string
  occurrences: number
  category: string
  accountId: string
}

export interface SavingsGoal {
  id: string
  name: string
  target: number
  startingAmount: number
  targetDate?: string
  createdAt: string
}

export interface DebtGoal {
  title: string
  targetDate: string
  debtIds: string[]
}

export type Currency = 'NPR' | 'USD' | 'INR' | 'GBP' | 'EUR'
export type DateFormat = 'd MMM yyyy' | 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'
export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  name: string
  currency: Currency
  dateFormat: DateFormat
  theme: Theme
  monthlyBudget: number
  budgetWarnPct: number
  includeOptionalInForecast: boolean
  notifications: {
    enabled: boolean
    upcomingDays: number
    budget: boolean
    overdue: boolean
    lowBalance: boolean
  }
  incomeCategories: string[]
  expenseCategories: string[]
}

export interface AppData {
  version: 1
  isDemo: boolean
  settings: Settings
  accounts: Account[]
  transactions: Transaction[]
  debts: Debt[]
  bills: Bill[]
  incomes: IncomeSource[]
  goals: SavingsGoal[]
  debtGoal?: DebtGoal
  /** category → monthly limit; applies every month (spending resets monthly) */
  budgets: Record<string, number>
}

export const KIND_LABEL: Record<TxKind, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  debt_payment: 'Debt payment',
  bill_payment: 'Bill / EMI',
  savings: 'Savings',
}

export const STATUS_LABEL: Record<TxStatus, string> = {
  completed: 'Completed',
  planned: 'Planned',
  cancelled: 'Cancelled',
}

export const FREQ_LABEL: Record<Frequency | 'flexible', string> = {
  once: 'One-time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  flexible: 'Flexible',
}

export const BILL_KIND_LABEL: Record<BillKind, string> = {
  credit_card: 'Credit card',
  emi: 'EMI / installment',
  internet: 'Internet',
  rent: 'Rent',
  subscription: 'Subscription',
  insurance: 'Insurance',
  other: 'Other',
}

export const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Investments', 'Other']
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Shopping',
  'Transport',
  'Housing',
  'Internet & Utilities',
  'Entertainment',
  'Health',
  'Travel',
  'Education',
  'Other',
]
