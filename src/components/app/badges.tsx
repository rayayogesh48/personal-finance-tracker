import { money } from '@/lib/format'
import { ArrowDownLeft, ArrowLeftRight, HandCoins, PiggyBank, Receipt, CalendarClock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isOverdue } from '@/lib/finance'
import type { Transaction, TxKind } from '@/lib/types'
import { KIND_LABEL, STATUS_LABEL } from '@/lib/types'

// eslint-disable-next-line react-refresh/only-export-components
export const KIND_STYLE: Record<TxKind, { icon: LucideIcon; chip: string; dot: string; text: string }> = {
  income: { icon: ArrowDownLeft, chip: 'bg-income-soft text-income', dot: 'bg-income', text: 'text-income' },
  expense: { icon: Receipt, chip: 'bg-expense-soft text-expense', dot: 'bg-expense', text: 'text-expense' },
  transfer: { icon: ArrowLeftRight, chip: 'bg-transfer-soft text-transfer', dot: 'bg-transfer', text: 'text-transfer' },
  debt_payment: { icon: HandCoins, chip: 'bg-debt-soft text-debt', dot: 'bg-debt', text: 'text-debt' },
  bill_payment: { icon: CalendarClock, chip: 'bg-bill-soft text-bill', dot: 'bg-bill', text: 'text-bill' },
  savings: { icon: PiggyBank, chip: 'bg-saving-soft text-saving', dot: 'bg-saving', text: 'text-saving' },
}

export function KindIcon({ kind, className }: { kind: TxKind; className?: string }) {
  const s = KIND_STYLE[kind]
  const Icon = s.icon
  return (
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4', s.chip, className)}>
      <Icon />
    </span>
  )
}

export function KindBadge({ kind }: { kind: TxKind }) {
  return <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', KIND_STYLE[kind].chip)}>{KIND_LABEL[kind]}</span>
}

export function StatusBadge({ tx }: { tx: Transaction }) {
  const overdue = isOverdue(tx)
  if (tx.status === 'planned' && tx.onHold)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
        <span className="size-1.5 rounded-full border border-current" />
        Not started
      </span>
    )
  const label = overdue ? 'Overdue' : tx.status === 'planned' && tx.reserved ? 'Reserved' : STATUS_LABEL[tx.status]
  const cls = overdue
    ? 'bg-overdue-soft text-overdue'
    : tx.status === 'completed'
      ? 'bg-income-soft text-income'
      : tx.status === 'cancelled'
        ? 'bg-muted text-muted-foreground line-through'
        : tx.reserved
          ? 'bg-reserved-soft text-reserved'
          : 'bg-upcoming-soft text-upcoming'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', cls)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

/** Signed amount with semantic colour: green in, red out, neutral transfer. */
export function Amount({ tx, className }: { tx: Transaction; className?: string }) {
  const sign = tx.kind === 'income' ? '+' : tx.kind === 'transfer' ? '' : '−'
  return (
    <span
      className={cn(
        'font-semibold tabular whitespace-nowrap',
        tx.kind === 'income' ? 'text-income' : tx.kind === 'transfer' ? 'text-foreground' : 'text-foreground',
        tx.status === 'cancelled' && 'text-muted-foreground line-through',
        className,
      )}
    >
      {sign}
      <MoneyText n={tx.amount} />
    </span>
  )
}

export function MoneyText({ n }: { n: number }) {
  return <>{money(n)}</>
}
