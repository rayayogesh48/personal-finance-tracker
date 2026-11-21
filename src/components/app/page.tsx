import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, description, action, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Card className={cn('gap-0 rounded-2xl py-0 shadow-xs', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('px-5 pb-5', !title && !action && 'pt-5', bodyClassName)}>{children}</div>
    </Card>
  )
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'income' | 'expense' | 'upcoming' | 'debt' | 'saving' | 'reserved' | 'bill'
  className?: string
}) {
  const toneCls = {
    default: 'bg-muted text-foreground',
    income: 'bg-income-soft text-income',
    upcoming: 'bg-upcoming-soft text-upcoming',
    expense: 'bg-expense-soft text-expense',
    debt: 'bg-debt-soft text-debt',
    saving: 'bg-saving-soft text-saving',
    reserved: 'bg-reserved-soft text-reserved',
    bill: 'bg-bill-soft text-bill',
  }[tone]
  return (
    <Card className={cn('gap-0 rounded-2xl p-4 shadow-xs sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className={cn('inline-flex size-7 items-center justify-center rounded-lg [&_svg]:size-3.5', toneCls)}>{icon}</span>}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight tabular sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>
}

/** Thin progress bar with semantic tone. Width tweens only on change (not a decorative entrance). */
export function Bar({ value, tone = 'income', className }: { value: number; tone?: 'income' | 'upcoming' | 'expense' | 'debt' | 'saving' | 'bill' | 'foreground'; className?: string }) {
  const c = { income: 'bg-income', upcoming: 'bg-upcoming', expense: 'bg-expense', debt: 'bg-debt', saving: 'bg-saving', bill: 'bg-bill', foreground: 'bg-foreground' }[tone]
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('bar h-full rounded-full', c)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <p className="text-xs text-expense">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
