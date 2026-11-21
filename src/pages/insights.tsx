import { useState } from 'react'
import { format, parseISO, subMonths } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Empty, PageHeader, Panel } from '@/components/app/page'
import { CategoryBars } from '@/components/app/charts'
import { useStore } from '@/lib/store'
import { activeMonths, insights, monthKey, monthStats } from '@/lib/finance'
import { money, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

export function InsightsPage() {
  const { data } = useStore()
  const [month, setMonth] = useState(monthKey(todayISO()))
  const list = insights(data, month)
  const cur = monthStats(data, month)
  const prevKey = format(subMonths(parseISO(`${month}-01`), 1), 'yyyy-MM')
  const prev = monthStats(data, prevKey)
  const cats = Array.from(new Set([...Object.keys(cur.byCategory), ...Object.keys(prev.byCategory)])).sort((a, b) => (cur.byCategory[b] ?? 0) - (cur.byCategory[a] ?? 0))

  return (
    <div>
      <PageHeader
        title="Insights"
        description="Observations drawn only from your own transactions. Nothing is shown unless the data supports it."
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44" aria-label="Month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeMonths(data).map((m) => (
                <SelectItem key={m} value={m}>
                  {format(parseISO(`${m}-01`), 'MMMM yyyy')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="What stands out">
          {list.length ? (
            <ul className="grid gap-2">
              {list.map((i) => {
                const Icon = i.tone === 'positive' ? ArrowDownRight : i.tone === 'negative' ? ArrowUpRight : Info
                return (
                  <li key={i.id} className={cn('flex gap-3 rounded-xl p-3 text-sm', i.tone === 'positive' ? 'bg-income-soft' : i.tone === 'negative' ? 'bg-expense-soft' : 'bg-muted/60')}>
                    <Icon className={cn('mt-0.5 size-4 shrink-0', i.tone === 'positive' ? 'text-income' : i.tone === 'negative' ? 'text-expense' : 'text-muted-foreground')} />
                    {i.text}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>Add a few completed transactions and insights will appear here.</Empty>
          )}
        </Panel>
        <div className="grid content-start gap-5">
          <Panel title="This month in numbers">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Num k="Income received" v={money(cur.income)} cls="text-income" />
              <Num k="Spent" v={money(cur.spending)} cls="text-expense" />
              <Num k="Debt repaid" v={money(cur.debtPaid)} />
              <Num k="Saved to goals" v={money(cur.saved)} />
              <Num k="Net" v={money(cur.net, { sign: true })} cls={cur.net < 0 ? 'text-expense' : 'text-income'} />
              <Num k="Last month spent" v={money(prev.spending)} />
            </dl>
          </Panel>
          <Panel title="Spending by category">
            {Object.keys(cur.byCategory).length ? <CategoryBars spent={cur.byCategory} budgets={data.budgets} /> : <Empty>No completed spending this month.</Empty>}
          </Panel>
        </div>
      </div>
      {cats.length > 0 && (
        <Panel className="mt-5" title="Compared with last month" bodyClassName="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">Category</th>
                <th className="py-2 text-right font-medium">{format(parseISO(`${prevKey}-01`), 'MMM')}</th>
                <th className="py-2 text-right font-medium">{format(parseISO(`${month}-01`), 'MMM')}</th>
                <th className="px-5 py-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const a = prev.byCategory[c] ?? 0
                const b = cur.byCategory[c] ?? 0
                const ch = a ? (b - a) / a : undefined
                return (
                  <tr key={c} className="border-b last:border-0">
                    <td className="px-5 py-2">{c}</td>
                    <td className="py-2 text-right tabular">{money(a)}</td>
                    <td className="py-2 text-right tabular">{money(b)}</td>
                    <td className={cn('px-5 py-2 text-right tabular', ch === undefined ? 'text-muted-foreground' : ch > 0 ? 'text-expense' : 'text-income')}>{ch === undefined ? 'new' : `${ch > 0 ? '+' : ''}${Math.round(ch * 100)}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

function Num({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={cn('font-semibold tabular', cls)}>{v}</dd>
    </div>
  )
}
