import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Download, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Empty, PageHeader, Panel } from '@/components/app/page'
import { Amount, KindBadge, KindIcon, StatusBadge } from '@/components/app/badges'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { isOpen, isVisible } from '@/lib/finance'
import { exportCsv } from '@/lib/io'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { go } from '@/lib/router'
import type { Transaction } from '@/lib/types'
import { KIND_LABEL, STATUS_LABEL } from '@/lib/types'

const ALL = '__all'

export function TransactionsPage() {
  const { data, setStatus, updateTx, deleteTx } = useStore()
  const { openNew, openEdit, openComplete } = useTx()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState(ALL)
  const [cat, setCat] = useState(ALL)
  const [status, setStatusF] = useState(ALL)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [del, setDel] = useState<Transaction | null>(null)

  const all = useMemo(() => data.transactions.filter(isVisible), [data.transactions])
  const hiddenCount = data.transactions.length - all.length
  const categories = useMemo(() => Array.from(new Set(all.map((t) => t.category))).sort(), [all])
  const rows = useMemo(
    () =>
      all
        .filter((t) => (kind === ALL || t.kind === kind) && (cat === ALL || t.category === cat) && (status === ALL || t.status === status))
        .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
        .filter((t) => !q || `${t.title} ${t.notes ?? ''} ${t.category}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [all, kind, cat, status, from, to, q],
  )
  const tot = rows.reduce(
    (a, t) => {
      if (t.status === 'cancelled' || t.kind === 'transfer') return a
      if (t.kind === 'income') a.in += t.amount
      else a.out += t.amount
      return a
    },
    { in: 0, out: 0 },
  )
  const filtered = kind !== ALL || cat !== ALL || status !== ALL || !!from || !!to || !!q

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Only completed transactions change your balance."
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(rows, data, filtered ? 'my-ullu-filtered' : 'my-ullu-transactions')} disabled={!rows.length}>
              <Download /> Export CSV
            </Button>
            <Button onClick={() => openNew({ kind: 'expense' })}>Add transaction</Button>
          </>
        }
      />

      <Panel className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" aria-label="Search transactions" />
          </div>
          <Filter value={kind} onChange={setKind} all="All types" options={Object.entries(KIND_LABEL).map(([v, l]) => ({ v, l }))} />
          <Filter value={cat} onChange={setCat} all="All categories" options={categories.map((c) => ({ v: c, l: c }))} />
          <Filter value={status} onChange={setStatusF} all="All statuses" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l }))} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            To <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto" />
          </label>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ('')
                setKind(ALL)
                setCat(ALL)
                setStatusF(ALL)
                setFrom('')
                setTo('')
              }}
            >
              <X /> Clear filters
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {hiddenCount > 0 && (
              <button type="button" onClick={() => go('bills')} className="underline-offset-4 hover:underline">
                {hiddenCount} hidden from not-started bills
              </button>
            )}
            <span>{rows.length} shown</span>
            <span>
              In <b className="text-income tabular">{money(tot.in)}</b>
            </span>
            <span>
              Out <b className="text-foreground tabular">{money(tot.out)}</b>
            </span>
          </div>
        </div>
      </Panel>

      <Panel bodyClassName="px-0 pb-0">
        {!rows.length ? (
          <div className="p-5">
            <Empty>{all.length ? 'No transactions match these filters.' : 'No transactions yet — add your first one.'}</Empty>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="py-3 font-medium">Description</th>
                    <th className="py-3 font-medium">Type</th>
                    <th className="py-3 font-medium">Category</th>
                    <th className="py-3 font-medium">Status</th>
                    <th className="py-3 text-right font-medium">Amount</th>
                    <th className="w-14" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">{fmtDate(t.date)}</td>
                      <td className="max-w-72 py-2.5">
                        <button type="button" onClick={() => openEdit(t)} className="flex min-w-0 items-center gap-2.5 text-left">
                          <KindIcon kind={t.kind} className="size-7 rounded-lg [&_svg]:size-3.5" />
                          <span className="min-w-0">
                            <span className={cn('block truncate font-medium', t.status === 'cancelled' && 'text-muted-foreground line-through')}>{t.title}</span>
                            {t.notes && <span className="block truncate text-xs text-muted-foreground">{t.notes}</span>}
                          </span>
                        </button>
                      </td>
                      <td className="py-2.5">
                        <KindBadge kind={t.kind} />
                      </td>
                      <td className="py-2.5 text-muted-foreground">{t.category}</td>
                      <td className="py-2.5">
                        <StatusBadge tx={t} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Amount tx={t} />
                      </td>
                      <td className="px-3 py-2.5">
                        <RowMenu t={t} onEdit={() => openEdit(t)} onComplete={() => openComplete(t)} onStatus={(s) => setStatus(t.id, s)} onReserve={(r) => updateTx(t.id, { reserved: r || undefined })} onDelete={() => setDel(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y lg:hidden">
              {rows.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => openEdit(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <KindIcon kind={t.kind} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', t.status === 'cancelled' && 'line-through opacity-60')}>{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(t.date)} · {t.category}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Amount tx={t} className="text-sm" />
                      <StatusBadge tx={t} />
                    </span>
                  </button>
                  <RowMenu t={t} onEdit={() => openEdit(t)} onComplete={() => openComplete(t)} onStatus={(s) => setStatus(t.id, s)} onReserve={(r) => updateTx(t.id, { reserved: r || undefined })} onDelete={() => setDel(t)} />
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              "{del?.title}" ({del && money(del.amount)}) will be removed for good. Balances and forecasts will be recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (del) deleteTx(del.id)
                toast('Transaction deleted')
                setDel(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Filter({ value, onChange, all, options }: { value: string; onChange: (v: string) => void; all: string; options: { v: string; l: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={all}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RowMenu({
  t,
  onEdit,
  onComplete,
  onStatus,
  onReserve,
  onDelete,
}: {
  t: Transaction
  onEdit: () => void
  onComplete: () => void
  onStatus: (s: Transaction['status']) => void
  onReserve: (r: boolean) => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${t.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {isOpen(t) && (
          <DropdownMenuItem onClick={onComplete}>
            <Check /> {t.kind === 'income' ? 'Mark received…' : 'Mark completed…'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {isOpen(t) && t.kind !== 'income' && t.kind !== 'transfer' && <DropdownMenuItem onClick={() => onReserve(!t.reserved)}>{t.reserved ? 'Release reserved cash' : 'Reserve cash'}</DropdownMenuItem>}
        {t.status !== 'planned' && <DropdownMenuItem onClick={() => onStatus('planned')}>Set as planned</DropdownMenuItem>}
        {t.status !== 'cancelled' && <DropdownMenuItem onClick={() => onStatus('cancelled')}>Cancel</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
