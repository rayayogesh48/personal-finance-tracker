import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Amount, KindIcon, StatusBadge } from './badges'
import { useTx } from './tx-dialogs'
import { fmtDate, relDays } from '@/lib/format'
import { isOpen, isOverdue } from '@/lib/finance'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/lib/types'

export function TxRow({ tx, rel, compact, hideAction }: { tx: Transaction; rel?: boolean; compact?: boolean; hideAction?: boolean }) {
  const { openEdit, openComplete } = useTx()
  return (
    <div className={cn('flex items-center gap-2 rounded-xl px-2 hover:bg-muted/60', compact ? 'py-1.5' : 'py-2.5')}>
      <button type="button" onClick={() => openEdit(tx)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <KindIcon kind={tx.kind} className={compact ? 'size-8 rounded-lg' : undefined} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', tx.status === 'cancelled' && 'text-muted-foreground line-through')}>{tx.title}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className={cn(isOverdue(tx) && 'text-overdue')}>
              {fmtDate(tx.date)}
              {rel && isOpen(tx) && ` · ${relDays(tx.date)}`}
            </span>
            {tx.optional && <Tag>optional</Tag>}
            {tx.external && <Tag>paid from outside</Tag>}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Amount tx={tx} className="text-sm" />
          <StatusBadge tx={tx} />
        </span>
      </button>
      {isOpen(tx) && !hideAction && (
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 text-income hover:bg-income-soft hover:text-income"
          aria-label={`Mark ${tx.title} as ${tx.kind === 'income' ? 'received' : 'completed'}`}
          title={tx.kind === 'income' ? 'Mark received' : 'Mark completed'}
          onClick={() => openComplete(tx)}
        >
          <Check />
        </Button>
      )}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1 text-[10px]">{children}</span>
}
