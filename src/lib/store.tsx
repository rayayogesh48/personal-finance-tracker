import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { configureFormat, todayISO, uid } from './format'
import { billTransactions, incomeTransactions, mergeSchedule } from './schedule'
import { createDemo, createEmpty } from './seed'
import { demoService, DEMO_STORAGE_KEY } from './demo'
import type { Account, AppData, Bill, Debt, DebtGoal, IncomeSource, SavingsGoal, Settings, Transaction, TxStatus } from './types'

/** Legacy single-browser key (before accounts were required). */
export const LEGACY_KEY = 'pocketledger:v1'

/** Where a ledger lives: a signed-in user's cache, the demo sandbox, or local-only (no Supabase configured). */
export type Space = { kind: 'user'; id: string; name?: string } | { kind: 'demo' } | { kind: 'local' }

const storageFor = (space: Space): { store: Storage; key: string } | null => {
  try {
    if (space.kind === 'demo') return { store: sessionStorage, key: DEMO_STORAGE_KEY }
    if (space.kind === 'user') return { store: localStorage, key: `pocketledger:user:${space.id}` }
    return { store: localStorage, key: LEGACY_KEY }
  } catch {
    return null
  }
}

export function isAppData(x: unknown): x is AppData {
  if (!x || typeof x !== 'object') return false
  const d = x as Record<string, unknown>
  return (
    d.version === 1 &&
    typeof d.settings === 'object' &&
    ['accounts', 'transactions', 'debts', 'bills', 'incomes', 'goals'].every((k) => Array.isArray(d[k])) &&
    typeof d.budgets === 'object'
  )
}

function readCache(space: Space): AppData | null {
  const s = storageFor(space)
  if (!s) return null
  try {
    const raw = s.store.getItem(s.key)
    if (raw) {
      const p = JSON.parse(raw)
      if (isAppData(p)) return p
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Starting data when nothing is cached for this space. */
function initialFor(space: Space): AppData {
  if (space.kind === 'demo') return demoService.initialData()
  if (space.kind === 'local') return createDemo()
  // New account on this device: carry over real (non-demo) data from the old local-only mode, otherwise start empty.
  const legacy = readCache({ kind: 'local' })
  if (legacy && !legacy.isDemo) return legacy
  const empty = createEmpty()
  return space.name ? { ...empty, settings: { ...empty.settings, name: space.name } } : empty
}

/** Remove a signed-in user's offline copy (on sign-out). */
export function clearUserCache(userId: string) {
  try {
    localStorage.removeItem(`pocketledger:user:${userId}`)
  } catch {
    /* ignore */
  }
}

export type NewTx = Omit<Transaction, 'id' | 'createdAt'>
const stamp = () => new Date().toISOString()

function useActions(set: React.Dispatch<React.SetStateAction<AppData>>) {
  return useMemo(() => {
    const txs = (fn: (t: Transaction[]) => Transaction[]) => set((d) => ({ ...d, transactions: fn(d.transactions) }))
    const mainAccount = (d: AppData) => d.accounts[0]?.id ?? 'acc-main'
    return {
      // transactions
      addTx(t: NewTx) {
        const tx: Transaction = { ...t, id: uid(), createdAt: stamp() }
        if (tx.status === 'completed') tx.completedOn ??= tx.date
        txs((all) => [...all, tx])
        return tx
      },
      updateTx(id: string, patch: Partial<Transaction>) {
        txs((all) =>
          all.map((t) => {
            if (t.id !== id) return t
            const n = { ...t, ...patch }
            if (n.status === 'completed') {
              n.completedOn ??= todayISO()
              delete n.reserved
              delete n.onHold
            } else delete n.completedOn
            return n
          }),
        )
      },
      deleteTx(id: string) {
        txs((all) => all.filter((t) => t.id !== id))
      },
      setStatus(id: string, status: TxStatus) {
        txs((all) => all.map((t) => (t.id === id ? { ...t, status, completedOn: status === 'completed' ? todayISO() : undefined, reserved: status === 'planned' ? t.reserved : undefined } : t)))
      },
      /** Mark a planned item complete with the actual amount; optionally keep the shortfall planned. */
      complete(id: string, o: { amount: number; date: string; keepRemainder?: boolean }) {
        txs((all) => {
          const t = all.find((x) => x.id === id)
          if (!t) return all
          const out = all.map((x) => (x.id === id ? { ...x, amount: o.amount, status: 'completed' as const, completedOn: o.date, reserved: undefined } : x))
          const rest = Math.round((t.amount - o.amount) * 100) / 100
          if (o.keepRemainder && rest > 0)
            out.push({ ...t, id: uid(), amount: rest, title: t.title.endsWith('(remaining)') ? t.title : `${t.title} (remaining)`, status: 'planned', completedOn: undefined, installment: undefined, createdAt: stamp() })
          return out
        })
      },

      // accounts
      addAccount(a: Omit<Account, 'id'>) {
        set((d) => ({ ...d, accounts: [...d.accounts, { ...a, id: uid() }] }))
      },
      updateAccount(id: string, patch: Partial<Account>) {
        set((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
      },
      deleteAccount(id: string) {
        set((d) => (d.accounts.length <= 1 ? d : { ...d, accounts: d.accounts.filter((a) => a.id !== id) }))
      },

      // debts
      addDebt(debt: Omit<Debt, 'id' | 'createdAt'>, plan?: { amount: number; date: string; count: number }) {
        set((d) => {
          const nd: Debt = { ...debt, id: uid(), createdAt: stamp() }
          const extra: Transaction[] = []
          if (plan && plan.amount > 0) {
            let left = nd.originalAmount
            for (let i = 0; i < plan.count && left > 0; i++) {
              const amt = Math.min(plan.amount, left)
              left -= amt
              const dt = new Date(plan.date)
              dt.setMonth(dt.getMonth() + i)
              extra.push({ id: uid(), date: dt.toISOString().slice(0, 10), title: `${nd.name} — repayment`, amount: amt, kind: 'debt_payment', category: 'Debt', status: 'planned', debtId: nd.id, accountId: mainAccount(d), createdAt: stamp() })
            }
          }
          const debtGoal = d.debtGoal ? { ...d.debtGoal, debtIds: [...d.debtGoal.debtIds, nd.id] } : d.debtGoal
          return { ...d, debts: [...d.debts, nd], transactions: [...d.transactions, ...extra], debtGoal }
        })
      },
      updateDebt(id: string, patch: Partial<Debt>) {
        set((d) => ({
          ...d,
          debts: d.debts.map((x) => (x.id === id ? { ...x, ...patch } : x)),
          transactions: patch.name ? d.transactions.map((t) => (t.debtId === id && isOpenTx(t) ? { ...t, title: t.title.replace(/^.*? —/, `${patch.name} —`) } : t)) : d.transactions,
        }))
      },
      /** Planned repayments go; completed ones stay in history (unlinked) so balances remain correct. */
      deleteDebt(id: string) {
        set((d) => ({
          ...d,
          debts: d.debts.filter((x) => x.id !== id),
          debtGoal: d.debtGoal ? { ...d.debtGoal, debtIds: d.debtGoal.debtIds.filter((x) => x !== id) } : undefined,
          transactions: d.transactions.filter((t) => !(t.debtId === id && t.status !== 'completed')).map((t) => (t.debtId === id ? { ...t, debtId: undefined } : t)),
        }))
      },

      // bills
      addBill(b: Omit<Bill, 'id'>) {
        set((d) => {
          const bill: Bill = { ...b, id: uid() }
          return { ...d, bills: [...d.bills, bill], transactions: [...d.transactions, ...billTransactions(bill, mainAccount(d))] }
        })
      },
      updateBill(b: Bill) {
        set((d) => {
          const existing = d.transactions.filter((t) => t.billId === b.id)
          const old = d.bills.find((x) => x.id === b.id)
          const same = !!old && old.amount === b.amount && JSON.stringify(old.emi) === JSON.stringify(b.emi) && old.occurrences === b.occurrences
          const merged = mergeSchedule(existing, billTransactions(b, existing[0]?.accountId ?? mainAccount(d)), (t) => t.installment ?? -1, same)
          return { ...d, bills: d.bills.map((x) => (x.id === b.id ? b : x)), transactions: [...d.transactions.filter((t) => t.billId !== b.id), ...merged] }
        })
      },
      /** Start a bill that was marked "not started": its payments join forecasts and reminders. */
      startBill(id: string) {
        set((d) => ({
          ...d,
          bills: d.bills.map((b) => (b.id === id ? { ...b, notStarted: undefined } : b)),
          transactions: d.transactions.map((t) => (t.billId === id && t.onHold ? { ...t, onHold: undefined } : t)),
        }))
      },
      deleteBill(id: string) {
        set((d) => ({
          ...d,
          bills: d.bills.filter((b) => b.id !== id),
          transactions: d.transactions.filter((t) => !(t.billId === id && t.status !== 'completed')).map((t) => (t.billId === id ? { ...t, billId: undefined } : t)),
        }))
      },

      // income sources
      addIncome(s: Omit<IncomeSource, 'id'>) {
        set((d) => {
          const src: IncomeSource = { ...s, id: uid() }
          return { ...d, incomes: [...d.incomes, src], transactions: [...d.transactions, ...incomeTransactions(src)] }
        })
      },
      updateIncome(s: IncomeSource) {
        set((d) => {
          const existing = d.transactions.filter((t) => t.incomeId === s.id)
          const old = d.incomes.find((x) => x.id === s.id)
          const merged = mergeSchedule(existing, incomeTransactions(s), (t) => t.installment ?? -1, old?.amount === s.amount)
          return { ...d, incomes: d.incomes.map((x) => (x.id === s.id ? s : x)), transactions: [...d.transactions.filter((t) => t.incomeId !== s.id), ...merged] }
        })
      },
      deleteIncome(id: string) {
        set((d) => ({
          ...d,
          incomes: d.incomes.filter((x) => x.id !== id),
          transactions: d.transactions.filter((t) => !(t.incomeId === id && t.status !== 'completed')).map((t) => (t.incomeId === id ? { ...t, incomeId: undefined } : t)),
        }))
      },

      // goals
      addGoal(g: Omit<SavingsGoal, 'id' | 'createdAt'>) {
        set((d) => ({ ...d, goals: [...d.goals, { ...g, id: uid(), createdAt: stamp() }] }))
      },
      updateGoal(id: string, patch: Partial<SavingsGoal>) {
        set((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
      },
      deleteGoal(id: string) {
        set((d) => ({
          ...d,
          goals: d.goals.filter((g) => g.id !== id),
          transactions: d.transactions.filter((t) => !(t.goalId === id && t.status !== 'completed')).map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
        }))
      },
      setDebtGoal(g: DebtGoal | undefined) {
        set((d) => ({ ...d, debtGoal: g }))
      },

      // budgets & settings
      setBudget(category: string, amount: number) {
        set((d) => ({ ...d, budgets: { ...d.budgets, [category]: amount } }))
      },
      updateSettings(patch: Partial<Settings>) {
        set((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
      },
      addCategory(type: 'income' | 'expense', name: string) {
        set((d) => {
          const key = type === 'income' ? 'incomeCategories' : 'expenseCategories'
          const list = d.settings[key]
          if (list.some((c) => c.toLowerCase() === name.toLowerCase())) return d
          return { ...d, settings: { ...d.settings, [key]: [...list, name] } }
        })
      },
      removeCategory(type: 'income' | 'expense', name: string) {
        set((d) => {
          const key = type === 'income' ? 'incomeCategories' : 'expenseCategories'
          return { ...d, settings: { ...d.settings, [key]: d.settings[key].filter((c) => c !== name) } }
        })
      },

      // data
      replaceAll(d: AppData) {
        set(d)
      },
      resetDemo() {
        set(demoService.initialData())
      },
      startFresh() {
        set((d) => createEmpty({ ...d.settings }))
      },
    }
  }, [set])
}

const isOpenTx = (t: Transaction) => t.status === 'planned'

type Store = { data: AppData; space: Space; hadCache: boolean } & ReturnType<typeof useActions>
const Ctx = createContext<Store | null>(null)

/** Mount with key={spaceKey} so switching account/demo gives a fresh store. */
export function StoreProvider({ space, children }: { space: Space; children: ReactNode }) {
  const [boot] = useState(() => {
    const cached = readCache(space)
    return { data: cached ?? initialFor(space), hadCache: !!cached }
  })
  const [data, setData] = useState<AppData>(boot.data)
  const actions = useActions(setData)

  // keep formatting in sync before children render
  configureFormat(data.settings.currency, data.settings.dateFormat)

  useEffect(() => {
    try {
      const s = storageFor(space)
      s?.store.setItem(s.key, JSON.stringify(data))
    } catch {
      /* storage unavailable */
    }
  }, [data, space])

  // theme
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => root.classList.toggle('dark', data.settings.theme === 'dark' || (data.settings.theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [data.settings.theme])

  const value = useMemo(() => ({ data, space, hadCache: boot.hadCache, ...actions }), [data, space, boot.hadCache, actions])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}
