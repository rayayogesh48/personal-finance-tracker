import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Bar, Empty, Field, PageHeader, Panel, Stat } from '@/components/app/page'
import { ResponsiveModal } from '@/components/app/responsive-modal'
import { Confirm } from '@/components/app/confirm'
import { TxRow } from '@/components/app/tx-row'
import { useTx } from '@/components/app/tx-dialogs'
import { useStore } from '@/lib/store'
import { goalStats } from '@/lib/finance'
import { fmtDate, money, parseAmount } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SavingsGoal } from '@/lib/types'

const TEMPLATES = ['Emergency fund', 'New phone', 'Vacation', 'New car', 'House deposit']

export function SavingsPage() {
  const { data } = useStore()
  const [edit, setEdit] = useState<SavingsGoal | 'new' | null>(null)
  const stats = data.goals.map((g) => goalStats(data, g))
  const saved = stats.reduce((a, s) => a + s.saved, 0)
  const target = stats.reduce((a, s) => a + s.goal.target, 0)

  return (
    <div>
      <PageHeader
        title="Savings goals"
        description="Contributions move money from your balance into a goal once completed."
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus /> New goal
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total saved" value={money(saved)} tone="saving" icon={<PiggyBank />} />
        <Stat label="Total targets" value={money(target)} hint={`${data.goals.length} goal${data.goals.length === 1 ? '' : 's'}`} />
        <Stat label="Still to save" value={money(Math.max(0, target - saved))} tone="upcoming" />
        <Stat label="Overall progress" value={`${target ? Math.round((saved / target) * 100) : 0}%`} hint={<Bar value={target ? saved / target : 0} tone="saving" className="mt-1.5" />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((s) => (
          <GoalCard key={s.goal.id} s={s} onEdit={() => setEdit(s.goal)} />
        ))}
        {!data.goals.length && <Empty>No goals yet. Try an emergency fund — even a small one helps.</Empty>}
      </div>
      <ResponsiveModal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'New savings goal' : 'Edit goal'}>
        {edit && <GoalForm goal={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </ResponsiveModal>
    </div>
  )
}

function GoalCard({ s, onEdit }: { s: ReturnType<typeof goalStats>; onEdit: () => void }) {
  const { deleteGoal } = useStore()
  const { openNew } = useTx()
  const g = s.goal
  const done = s.saved >= g.target
  return (
    <Panel
      title={<span className="text-base">{g.name}</span>}
      description={g.targetDate ? `Target ${fmtDate(g.targetDate)}${s.days !== undefined ? (s.days >= 0 ? ` · ${s.days} days left` : ' · date passed') : ''}` : 'No target date'}
      action={
        <div className="flex">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${g.name}`}>
            <Pencil />
          </Button>
          <Confirm
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Delete ${g.name}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete ${g.name}?`}
            description="Planned contributions are removed. Completed contributions stay in your history (and remain deducted from your balance)."
            onConfirm={() => {
              deleteGoal(g.id)
              toast('Goal deleted')
            }}
          />
        </div>
      }
    >
      <div className="grid gap-4 pt-1">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tabular">{money(s.saved)}</div>
            <div className="text-xs text-muted-foreground">of {money(g.target)}</div>
          </div>
          <span className={cn('text-sm font-semibold tabular', done ? 'text-income' : 'text-saving')}>{Math.round(s.pct * 100)}%</span>
        </div>
        <Bar value={s.pct} tone={done ? 'income' : 'saving'} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {done ? 'Goal reached.' : s.perMonth ? `Save about ${money(s.perMonth)} a month to reach it on time.` : `${money(s.remaining)} to go.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openNew({ kind: 'savings', goalId: g.id, category: 'Savings', status: 'completed' })}>
            <Plus /> Add contribution
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openNew({ kind: 'savings', goalId: g.id, category: 'Savings', status: 'planned', amount: s.perMonth ? Math.round(s.perMonth) : 0 })}>
            Plan contribution
          </Button>
        </div>
        {s.planned.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Planned</div>
            <div className="-mx-2">
              {s.planned.map((t) => (
                <TxRow key={t.id} tx={t} compact />
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Contribution history</div>
          {s.contributions.length ? (
            <div className="-mx-2">
              {[...s.contributions].reverse().map((t) => (
                <TxRow key={t.id} tx={t} compact />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{g.startingAmount ? `Started with ${money(g.startingAmount)}. ` : ''}No contributions yet.</p>
          )}
        </div>
      </div>
    </Panel>
  )
}

function GoalForm({ goal, onDone }: { goal?: SavingsGoal; onDone: () => void }) {
  const { addGoal, updateGoal } = useStore()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [start, setStart] = useState(goal?.startingAmount ? String(goal.startingAmount) : '')
  const [date, setDate] = useState(goal?.targetDate ?? '')
  const [err, setErr] = useState<Record<string, string>>({})
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = parseAmount(target)
    const s = start.trim() ? parseAmount(start) : 0
    const er: Record<string, string> = {}
    if (!name.trim()) er.name = 'Name your goal'
    if (!Number.isFinite(t) || t <= 0) er.target = 'Enter a target above zero'
    if (!Number.isFinite(s) || s < 0) er.start = 'Enter 0 or more'
    setErr(er)
    if (Object.keys(er).length) return
    const p = { name: name.trim(), target: t, startingAmount: s, targetDate: date || undefined }
    if (goal) updateGoal(goal.id, p)
    else addGoal(p)
    toast.success(goal ? 'Goal updated' : 'Goal created')
    onDone()
  }
  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      {!goal && (
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button type="button" key={t} onClick={() => setName(t)} className={cn('pressable rounded-full border px-3 py-1 text-xs', name === t ? 'border-transparent bg-saving-soft text-saving' : 'text-muted-foreground hover:bg-muted')}>
              {t}
            </button>
          ))}
        </div>
      )}
      <Field label="Goal name" error={err.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount" error={err.target}>
          <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="tabular" />
        </Field>
        <Field label="Already saved" error={err.start} hint="Money saved before tracking here">
          <Input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} className="tabular" placeholder="0" />
        </Field>
      </div>
      <Field label="Target date (optional)">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{goal ? 'Save' : 'Create goal'}</Button>
      </div>
    </form>
  )
}
