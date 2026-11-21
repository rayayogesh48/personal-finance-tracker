import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Mail, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/app/page'
import {
  can,
  FREQ_LABEL,
  goalProgress,
  GROUP_COLORS,
  GROUP_EXPENSE_CATEGORIES,
  GROUP_ICONS,
  groupApi,
  groupTotals,
  memberName,
  recurringStatus,
  type Frequency,
  type Group,
  type GroupData,
  type GroupGoal,
  type GroupRole,
  type GroupTx,
  type GroupTxType,
  type WithdrawalMode,
} from '@/lib/groups'
import { fmt, moneyIn, parseAmount, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Currency } from '@/lib/types'

export const COLOR_CLASS: Record<string, { bg: string; soft: string; text: string }> = {
  blue: { bg: 'bg-bill', soft: 'bg-bill-soft', text: 'text-bill' },
  green: { bg: 'bg-income', soft: 'bg-income-soft', text: 'text-income' },
  orange: { bg: 'bg-upcoming', soft: 'bg-upcoming-soft', text: 'text-upcoming' },
  violet: { bg: 'bg-debt', soft: 'bg-debt-soft', text: 'text-debt' },
  teal: { bg: 'bg-saving', soft: 'bg-saving-soft', text: 'text-saving' },
  rose: { bg: 'bg-expense', soft: 'bg-expense-soft', text: 'text-expense' },
  slate: { bg: 'bg-transfer', soft: 'bg-transfer-soft', text: 'text-transfer' },
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[] }) {
  return (
    <div className="grid gap-1 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }} role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn('pressable rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-40', value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function FormActions({ busy, label, onCancel, danger }: { busy: boolean; label: string; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" size="lg" variant={danger ? 'destructive' : 'default'} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} {label}
      </Button>
    </div>
  )
}

function ErrorNote({ text }: { text: string | null }) {
  return <div aria-live="polite">{text && <p className="rounded-xl bg-expense-soft px-3 py-2.5 text-sm text-expense">{text}</p>}</div>
}

// ------------------------------------------------------------------ group

export function GroupForm({ group, onDone, defaultCurrency }: { group?: Group; onDone: (id?: string) => void; defaultCurrency: Currency }) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [icon, setIcon] = useState(group?.icon ?? '💰')
  const [color, setColor] = useState(group?.color ?? 'green')
  const [currency, setCurrency] = useState<Currency>(group?.currency ?? defaultCurrency)
  const [mode, setMode] = useState<WithdrawalMode>(group?.withdrawal_mode ?? 'approval')
  const [confirmContrib, setConfirmContrib] = useState(group?.contributions_need_confirmation ?? false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Give your group a name.')
    setBusy(true)
    setErr(null)
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined, icon, color, currency, withdrawal_mode: mode, contributions_need_confirmation: confirmContrib }
      if (group) {
        await groupApi.updateGroup(group.id, payload)
        toast.success('Group updated')
        onDone(group.id)
      } else {
        const id = await groupApi.createGroup(payload)
        toast.success(`${name.trim()} created`)
        onDone(id)
      }
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      {!group && (
        <div className="flex flex-wrap gap-1.5">
          {['Family Savings', "Couple's Savings", 'Friends Trip', 'Household Expenses', 'Emergency Fund'].map((s) => (
            <button key={s} type="button" onClick={() => setName(s)} className={cn('pressable rounded-full border px-3 py-1 text-xs', name === s ? 'border-transparent bg-income-soft text-income' : 'text-muted-foreground hover:bg-muted')}>
              {s}
            </button>
          ))}
        </div>
      )}
      <Field label="Group name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus={!group} />
      </Field>
      <Field label="Description (optional)">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder="What is this group saving for?" />
      </Field>
      <Field label="Icon">
        <div className="flex flex-wrap gap-1.5">
          {GROUP_ICONS.map((i) => (
            <button key={i} type="button" onClick={() => setIcon(i)} aria-pressed={icon === i} aria-label={`Icon ${i}`} className={cn('pressable inline-flex size-10 items-center justify-center rounded-xl text-lg', icon === i ? 'bg-foreground/10 ring-2 ring-foreground/30' : 'bg-muted hover:bg-muted/70')}>
              {i}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Colour">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} className={cn('pressable size-7 rounded-full', COLOR_CLASS[c].bg, color === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-background')} />
            ))}
          </div>
        </Field>
        <Field label="Currency" hint={group ? 'Locked once money has been recorded.' : undefined}>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['NPR', 'INR', 'USD', 'GBP', 'EUR'] as Currency[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Taking money out (personal withdrawals)">
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'approval', label: 'Needs approval' },
            { value: 'direct', label: 'Anyone can' },
            { value: 'admins_only', label: 'Admins only' },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {mode === 'approval' && 'Members can ask to withdraw; an admin approves before the money leaves the group.'}
          {mode === 'direct' && 'Members can withdraw straight away, as long as there is enough money.'}
          {mode === 'admins_only' && 'Only the owner and admins can withdraw.'}
        </p>
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <span>
          Admins confirm savings
          <span className="block text-xs text-muted-foreground">Members' savings count only after an admin confirms the money arrived.</span>
        </span>
        <Switch checked={confirmContrib} onCheckedChange={setConfirmContrib} />
      </label>
      <ErrorNote text={err} />
      <FormActions busy={busy} label={group ? 'Save changes' : 'Create group'} onCancel={() => onDone()} />
    </form>
  )
}

// ------------------------------------------------------------------ transaction

export function GroupTxForm({ data, role, userId, initialType, initialGoalId, onDone }: { data: GroupData; role: GroupRole; userId: string; initialType: GroupTxType; initialGoalId?: string | null; onDone: () => void }) {
  const g = data.group
  const cur = g.currency
  const isAdmin = can.manage(role)
  const totals = groupTotals(data)
  const goals = data.goals.filter((x) => !x.archived_at)
  const [type, setType] = useState<GroupTxType>(initialType)
  const [goalId, setGoalId] = useState<string>(initialGoalId ?? '')
  const goal = goals.find((x) => x.id === goalId)
  const rec = goal?.kind === 'recurring' ? recurringStatus(data, goal) : null
  const [period, setPeriod] = useState<string>('')
  const [amt, setAmt] = useState('')
  const [category, setCategory] = useState(initialType === 'expense' ? 'Food' : 'Savings')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayISO())
  const [memberId, setMemberId] = useState(userId)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // One id per opened form: a double-click or retry can never create two records.
  const requestId = useRef(crypto.randomUUID())

  // Recurring goal: default to the oldest unpaid period for the chosen member, and its amount.
  useEffect(() => {
    if (type !== 'contribution' || !rec || !goal) return
    const unpaid = rec.periods.filter((p) => !p.members.find((m) => m.userId === memberId)?.done && !p.members.find((m) => m.userId === memberId)?.pending)
    setPeriod(unpaid[0]?.period ?? rec.current ?? '')
    if (goal.contribution_amount) setAmt(String(goal.contribution_amount))
  }, [goalId, memberId, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = parseAmount(amt)
  const outflow = type !== 'contribution'
  const goalBal = goal ? goalProgress(data, goal).balance : null
  const willNeedApproval = (type === 'withdrawal' && g.withdrawal_mode === 'approval' && !isAdmin) || (type === 'contribution' && g.contributions_need_confirmation && !isAdmin)
  const over = outflow && Number.isFinite(n) && (n > totals.balance || (goalBal !== null && n > goalBal))
  const fixed = type === 'contribution' && goal?.kind === 'recurring' && !goal.allow_flexible_amounts

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!Number.isFinite(n) || n <= 0) return setErr('Enter an amount above zero.')
    if (over && !willNeedApproval) return setErr(`Not enough money. Only ${moneyIn(goalBal !== null ? Math.min(goalBal, totals.balance) : totals.balance, cur)} is available.`)
    if (type === 'expense' && !description.trim()) return setErr('Say what the money was spent on.')
    setBusy(true)
    try {
      const receiptPath = file ? await groupApi.uploadReceipt(g.id, file) : null
      const tx = await groupApi.addTransaction({
        groupId: g.id,
        type,
        amount: n,
        goalId: goalId || null,
        category: type === 'contribution' ? 'Savings' : type === 'withdrawal' ? 'Personal' : category,
        description: description.trim() || undefined,
        occurredOn: date,
        periodDate: type === 'contribution' && rec ? period || null : null,
        receiptPath,
        clientRequestId: requestId.current,
        memberId: isAdmin && type !== 'expense' ? memberId : null,
      })
      toast.success(tx.status === 'pending' ? 'Sent for approval — the balance changes once an admin approves.' : `${moneyIn(tx.amount, cur)} ${type === 'contribution' ? 'added to savings' : type === 'expense' ? 'expense recorded' : 'withdrawn'}`)
      onDone()
    } catch (x) {
      setErr((x as Error).message)
      requestId.current = crypto.randomUUID() // a fresh attempt after a real failure
    } finally {
      setBusy(false)
    }
  }

  const activeMembers = data.members.filter((m) => !m.removed_at && m.role !== 'viewer')

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <Seg
        value={type}
        onChange={(t) => {
          setType(t)
          setCategory(t === 'expense' ? 'Food' : 'Savings')
        }}
        options={[
          { value: 'contribution', label: 'Add savings' },
          { value: 'expense', label: 'Group expense' },
          { value: 'withdrawal', label: 'Withdraw', disabled: !can.withdraw(role, g) },
        ]}
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        {type === 'contribution' && 'Money you put into the shared fund.'}
        {type === 'expense' && 'Money spent from the shared fund on something for the group.'}
        {type === 'withdrawal' && 'Money a member takes out of the shared fund for themselves.'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Savings goal">
          <Select value={goalId || '__none'} onValueChange={(v) => setGoalId(v === '__none' ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">General fund</SelectItem>
              {goals.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {isAdmin && type !== 'expense' ? (
          <Field label={type === 'contribution' ? 'Whose savings' : 'Who is withdrawing'}>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.user_id === userId ? 'Me' : memberName(data, m.user_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
          </Field>
        )}
      </div>

      {type === 'contribution' && rec && (
        <Field label="For which period" hint={`${FREQ_LABEL[goal!.frequency!]} · ${moneyIn(goal!.contribution_amount ?? 0, cur)} each`}>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a period" />
            </SelectTrigger>
            <SelectContent>
              {[...rec.periods].reverse().slice(0, 24).map((p) => {
                const me = p.members.find((m) => m.userId === memberId)
                return (
                  <SelectItem key={p.period} value={p.period}>
                    {fmt(p.period, 'd MMM yyyy')} {me?.done ? '· paid' : me?.pending ? '· waiting' : '· due'}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field
        label="Amount"
        hint={outflow ? `Available: ${moneyIn(goalBal !== null ? Math.min(goalBal, totals.balance) : totals.balance, cur)}${goal ? ` in ${goal.name}` : ''}` : undefined}
      >
        <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.,]/g, ''))} readOnly={fixed} className="h-12 text-xl font-semibold tabular" placeholder="0" autoFocus aria-invalid={over} />
        {over && (
          <p className="text-xs text-expense">{willNeedApproval ? 'More than the group has right now — it can only be approved once enough money is saved.' : 'More than the group has. Lower the amount.'}</p>
        )}
      </Field>

      {type === 'expense' && (
        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {isAdmin && type !== 'expense' && (
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
        </Field>
      )}

      <Field label={type === 'expense' ? 'What was it for?' : 'Note (optional)'}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder={type === 'expense' ? 'e.g. Groceries for the trip' : ''} />
      </Field>

      <Field label="Receipt (optional)">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50">
          <Paperclip className="size-4" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Attach a photo or PDF (max 10 MB)'}</span>
          {file && (
            <button type="button" onClick={(e) => (e.preventDefault(), setFile(null))} aria-label="Remove receipt" className="rounded p-0.5 hover:bg-muted">
              <X className="size-4" />
            </button>
          )}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </Field>

      {willNeedApproval && <p className="rounded-xl bg-upcoming-soft px-3 py-2.5 text-sm text-upcoming">An admin needs to approve this. Until then it won't change the group balance.</p>}
      <ErrorNote text={err} />
      <FormActions busy={busy} label={type === 'contribution' ? 'Add savings' : type === 'expense' ? 'Record expense' : willNeedApproval ? 'Request withdrawal' : 'Withdraw'} onCancel={onDone} />
    </form>
  )
}

// ------------------------------------------------------------------ goal

export function GoalForm({ groupId, goal, currency, onDone }: { groupId: string; goal?: GroupGoal; currency: Currency; onDone: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [kind, setKind] = useState<GroupGoal['kind']>(goal?.kind ?? 'one_time')
  const [target, setTarget] = useState(goal?.target_amount ? String(goal.target_amount) : '')
  const [amount, setAmount] = useState(goal?.contribution_amount ? String(goal.contribution_amount) : '')
  const [freq, setFreq] = useState<Frequency>(goal?.frequency ?? 'monthly')
  const [interval, setInterval_] = useState(String(goal?.interval_days ?? 14))
  const [start, setStart] = useState(goal?.start_date ?? todayISO())
  const [end, setEnd] = useState(goal?.end_date ?? '')
  const [flex, setFlex] = useState(goal?.allow_flexible_amounts ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const t = target.trim() ? parseAmount(target) : null
    const a = parseAmount(amount)
    if (!name.trim()) return setErr('Name the goal.')
    if (t !== null && (!Number.isFinite(t) || t <= 0)) return setErr('Target must be above zero, or leave it empty for an open fund.')
    if (kind === 'recurring') {
      if (!Number.isFinite(a) || a <= 0) return setErr('Set how much each person saves per period.')
      if (!start) return setErr('Pick a start date.')
      if (end && end < start) return setErr('The end date must be after the start date.')
      if (freq === 'custom' && !(Number(interval) >= 1 && Number(interval) <= 365)) return setErr('Repeat every 1–365 days.')
    }
    setBusy(true)
    try {
      await groupApi.saveGoal(groupId, goal?.id ?? null, {
        name: name.trim(),
        description: description.trim() || null,
        kind,
        target_amount: t,
        contribution_amount: kind === 'recurring' ? a : null,
        frequency: kind === 'recurring' ? freq : null,
        interval_days: kind === 'recurring' && freq === 'custom' ? Number(interval) : null,
        start_date: kind === 'recurring' ? start : null,
        end_date: kind === 'recurring' && end ? end : null,
        allow_flexible_amounts: flex,
      })
      toast.success(goal ? 'Goal updated' : 'Goal created')
      onDone()
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <Field label="Goal name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Goa trip, New sofa" autoFocus={!goal} />
      </Field>
      <Field label="Type">
        <Seg
          value={kind}
          onChange={setKind}
          options={[
            { value: 'one_time', label: 'Save any time' },
            { value: 'recurring', label: 'Regular savings' },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {kind === 'one_time' ? 'Members add money whenever they like.' : 'Everyone saves a set amount on a schedule. We track who has paid for each period — reminders never add money by themselves.'}
        </p>
      </Field>
      <Field label={`Target (${currency}, optional)`} hint="Leave empty for an open-ended shared fund.">
        <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="tabular" />
      </Field>
      {kind === 'recurring' && (
        <div className="grid gap-3 rounded-xl border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Each person saves">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" />
            </Field>
            <Field label="How often">
              <Select value={freq} onValueChange={(v) => setFreq(v as Frequency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['daily', 'weekly', 'monthly', 'custom'] as Frequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQ_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {freq === 'custom' && (
              <Field label="Repeat every (days)">
                <Input inputMode="numeric" value={interval} onChange={(e) => setInterval_(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            <Field label="Starts">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Ends (optional)">
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Allow different amounts
              <span className="block text-xs text-muted-foreground">Members may pay more or less than the set amount.</span>
            </span>
            <Switch checked={flex} onCheckedChange={setFlex} />
          </label>
        </div>
      )}
      <Field label="Description (optional)">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} />
      </Field>
      <ErrorNote text={err} />
      <FormActions busy={busy} label={goal ? 'Save goal' : 'Create goal'} onCancel={onDone} />
    </form>
  )
}

// ------------------------------------------------------------------ invite

export function InviteForm({ group, role, onDone }: { group: Group; role: GroupRole; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer' | 'admin'>('member')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<typeof groupApi.invite>> | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("That email address doesn't look right.")
    setBusy(true)
    try {
      setResult(await groupApi.invite(group.id, email.trim().toLowerCase(), inviteRole))
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const gmail = useMemo(() => {
    if (!result) return ''
    const su = `${result.inviter} invited you to ${group.name} on PocketLedger`
    const body = `Hi,\n\nI've invited you to join "${group.name}" on PocketLedger so we can save and track our shared money together.\n\nJoin here (sign in or create an account with this email address):\n${result.link}\n\nThe link works once and expires in 7 days.`
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email.trim())}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`
  }, [result, email, group.name])

  if (result)
    return (
      <div className="grid gap-4 pb-2">
        {result.delivered === 'resend' ? (
          <div className="rounded-xl bg-income-soft p-3 text-sm text-income">
            <b>Invitation emailed to {email.trim()}.</b>
            <span className="mt-0.5 block text-foreground/70">You can also send it from your own Gmail so they recognise who it's from.</span>
          </div>
        ) : (
          <div className="grid gap-3 rounded-xl bg-muted/60 p-4 text-sm">
            <div>
              <b>Invitation ready — send it to {email.trim()}</b>
              <span className="mt-0.5 block text-muted-foreground">
                {result.delivered === 'failed' ? "The automatic email couldn't be sent, so send it from your Gmail." : 'Open a ready-to-send email in Gmail, or copy the link and share it however you like.'}
              </span>
            </div>
            <Button asChild size="lg" className="justify-self-start">
              <a href={gmail} target="_blank" rel="noreferrer">
                <Mail /> Send with Gmail
              </a>
            </Button>
          </div>
        )}
        <Field label="Join link (works once · expires in 7 days)" hint={`They sign in or create an account with ${email.trim()} to join.`}>
          <div className="flex gap-2">
            <Input readOnly value={result.link} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Join link" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(result.link)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => (setResult(null), setEmail(''))}>
            Invite someone else
          </Button>
          {result.delivered === 'resend' && (
            <Button asChild variant="outline">
              <a href={gmail} target="_blank" rel="noreferrer">
                <Mail /> Send with Gmail
              </a>
            </Button>
          )}
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    )

  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <Field label="Their email address" hint="They'll sign in or create a PocketLedger account with this email to join.">
        <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
      </Field>
      <Field label="Role">
        <Seg
          value={inviteRole}
          onChange={setInviteRole}
          options={[
            { value: 'member', label: 'Member' },
            { value: 'viewer', label: 'Viewer' },
            { value: 'admin', label: 'Admin', disabled: role !== 'owner' },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {inviteRole === 'member' && 'Can see everything, add savings and expenses, and withdraw according to group rules.'}
          {inviteRole === 'viewer' && 'Can see everything but cannot add or change money.'}
          {inviteRole === 'admin' && 'Can also invite people, manage goals and approve withdrawals.'}
        </p>
      </Field>
      <ErrorNote text={err} />
      <FormActions busy={busy} label="Send invitation" onCancel={onDone} />
    </form>
  )
}

// ------------------------------------------------------------------ correct / cancel

export function CorrectForm({ tx, currency, onDone }: { tx: GroupTx; currency: Currency; onDone: () => void }) {
  const [amt, setAmt] = useState(String(tx.amount))
  const [category, setCategory] = useState(tx.category)
  const [description, setDescription] = useState(tx.description ?? '')
  const [date, setDate] = useState(tx.occurred_on)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseAmount(amt)
    if (!Number.isFinite(n) || n <= 0) return setErr('Enter an amount above zero.')
    if (!reason.trim()) return setErr('Say briefly why you are correcting it.')
    setBusy(true)
    try {
      await groupApi.correct(tx.id, { amount: n, category, description, occurredOn: date, reason: reason.trim() })
      toast.success('Corrected — the original stays in the history')
      onDone()
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
        The original ({moneyIn(tx.amount, currency)} on {fmt(tx.occurred_on, 'd MMM yyyy')}) is kept and marked as corrected. A new record replaces it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} className="tabular" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {tx.type === 'expense' && (
        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set([...GROUP_EXPENSE_CATEGORIES, category])).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Note">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} />
      </Field>
      <Field label="Reason for the correction">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Typed the wrong amount" />
      </Field>
      <ErrorNote text={err} />
      <FormActions busy={busy} label="Save correction" onCancel={onDone} />
    </form>
  )
}

export function CancelForm({ tx, currency, onDone }: { tx: GroupTx; currency: Currency; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return setErr('Please give a short reason.')
    setBusy(true)
    try {
      await groupApi.cancel(tx.id, reason.trim())
      toast('Cancelled — it stays in the history for everyone to see')
      onDone()
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 pb-2" noValidate>
      <p className="text-sm text-muted-foreground">
        {moneyIn(tx.amount, currency)} on {fmt(tx.occurred_on, 'd MMM yyyy')} will be marked as cancelled. Nothing is deleted; every member can still see it with your reason.
      </p>
      <Field label="Reason">
        <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Added twice by mistake" />
      </Field>
      <ErrorNote text={err} />
      <FormActions busy={busy} label="Cancel transaction" onCancel={onDone} danger />
    </form>
  )
}
