import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Bar as RBar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleCheck,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Target,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Bar, Empty, PageHeader, Panel, Stat } from '@/components/app/page'
import { ResponsiveModal } from '@/components/app/responsive-modal'
import { Confirm } from '@/components/app/confirm'
import { CancelForm, COLOR_CLASS, CorrectForm, GoalForm, GroupForm, GroupTxForm, InviteForm } from '@/components/groups/forms'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/lib/store'
import { go, useRouteParams } from '@/lib/router'
import { fmt, moneyCompact, moneyIn } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  can,
  expensesByCategory,
  exportGroupCsv,
  FREQ_LABEL,
  goalProgress,
  groupApi,
  groupTotals,
  memberName,
  memberSummary,
  monthlySeries,
  recurringStatus,
  ROLE_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  useGroup,
  useMyGroups,
  type GroupActivity,
  type GroupData,
  type GroupGoal,
  type GroupRole,
  type GroupTx,
  type GroupTxType,
} from '@/lib/groups'

// ================================================================== entry

export function GroupsPage() {
  const params = useRouteParams()
  const { session, demo } = useAuth()
  if (!session)
    return (
      <div>
        <PageHeader title="Groups" description="Save and spend money together with family, friends or roommates." />
        <Panel>
          <div className="flex flex-col items-start gap-3 py-2">
            <Users className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {demo ? "Groups are shared with real people, so they need an account. Create one to start a group or join one you've been invited to." : 'Sign in to use groups.'}
            </p>
          </div>
        </Panel>
      </div>
    )
  return params[0] ? <GroupDetail groupId={params[0]} tab={params[1] ?? 'overview'} userId={session.user.id} /> : <GroupList userId={session.user.id} />
}

// ================================================================== list

function GroupList({ userId }: { userId: string }) {
  const { data } = useStore()
  const { groups, invites, error, reload } = useMyGroups(userId)
  const [create, setCreate] = useState(false)
  const [busyInvite, setBusyInvite] = useState<string | null>(null)

  const respond = async (id: string, accept: boolean) => {
    setBusyInvite(id)
    try {
      if (accept) {
        const gid = await groupApi.acceptInvitationById(id)
        toast.success('You joined the group')
        go('groups', gid)
      } else {
        await groupApi.declineInvitation(id)
        toast('Invitation declined')
        void reload()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyInvite(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Groups"
        description="Shared savings and expenses. Group money is kept completely separate from your personal finances."
        actions={
          <Button onClick={() => setCreate(true)}>
            <Plus /> New group
          </Button>
        }
      />

      {invites.length > 0 && (
        <Panel className="mb-5" title="Invitations for you">
          <ul className="divide-y">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-lg">{i.group_icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{i.group_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.inviter_name} invited you as {ROLE_LABEL[i.role].toLowerCase()} · expires {fmt(i.expires_at.slice(0, 10), 'd MMM')}
                  </div>
                </div>
                <Button size="sm" variant="ghost" disabled={busyInvite === i.id} onClick={() => respond(i.id, false)}>
                  Decline
                </Button>
                <Button size="sm" disabled={busyInvite === i.id} onClick={() => respond(i.id, true)}>
                  {busyInvite === i.id && <Loader2 className="animate-spin" />} Join group
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {error && <p className="mb-4 rounded-xl bg-expense-soft p-3 text-sm text-expense">{error}</p>}

      {groups === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-muted/60" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-income-soft text-2xl">👥</span>
            <div>
              <div className="font-semibold">No groups yet</div>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a group to save towards something together — a trip, a home, an emergency fund — and see exactly who put in what.</p>
            </div>
            <Button onClick={() => setCreate(true)}>
              <Plus /> Create your first group
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(({ group: g, role, members, balance, pending }) => {
            const c = COLOR_CLASS[g.color] ?? COLOR_CLASS.blue
            return (
              <button
                type="button"
                key={g.id}
                onClick={() => go('groups', g.id)}
                className="pressable group flex flex-col rounded-2xl bg-card p-5 text-left shadow-xs ring-1 ring-foreground/10 hover:ring-foreground/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn('inline-flex size-11 items-center justify-center rounded-2xl text-xl', c.soft)}>{g.icon}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{ROLE_LABEL[role]}</span>
                </div>
                <div className="mt-3 truncate font-semibold">{g.name}</div>
                <div className="text-xs text-muted-foreground">
                  {members} member{members === 1 ? '' : 's'}
                  {pending > 0 && <span className="text-upcoming"> · {pending} waiting for approval</span>}
                </div>
                <div className="mt-4 text-2xl font-semibold tracking-tight tabular">{moneyIn(balance, g.currency)}</div>
                <div className="text-xs text-muted-foreground">in the group</div>
              </button>
            )
          })}
        </div>
      )}

      <ResponsiveModal open={create} onOpenChange={setCreate} title="Create a group" description="You'll be the owner. Invite people once it's created.">
        {create && (
          <GroupForm
            defaultCurrency={data.settings.currency}
            onDone={(id) => {
              setCreate(false)
              if (id) go('groups', id)
            }}
          />
        )}
      </ResponsiveModal>
    </div>
  )
}

// ================================================================== detail

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'goals', label: 'Goals' },
  { id: 'members', label: 'Members' },
  { id: 'reports', label: 'Reports' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
] as const

type Modal =
  | { kind: 'tx'; type: GroupTxType; goalId?: string | null }
  | { kind: 'goal'; goal?: GroupGoal }
  | { kind: 'invite' }
  | { kind: 'correct'; tx: GroupTx }
  | { kind: 'cancel'; tx: GroupTx }
  | { kind: 'edit' }
  | null

function GroupDetail({ groupId, tab, userId }: { groupId: string; tab: string; userId: string }) {
  const { data, error, loading, reload } = useGroup(groupId)
  const [modal, setModal] = useState<Modal>(null)

  if (loading && !data)
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> Loading group…
      </div>
    )
  if (!data)
    return (
      <div className="py-10">
        <Button variant="ghost" onClick={() => go('groups')}>
          <ArrowLeft /> All groups
        </Button>
        <p className="mt-4 rounded-xl bg-expense-soft p-4 text-sm text-expense">{error ?? 'Group not found.'}</p>
      </div>
    )

  const g = data.group
  const me = data.members.find((m) => m.user_id === userId && !m.removed_at)
  const role = me?.role
  const c = COLOR_CLASS[g.color] ?? COLOR_CLASS.blue
  const done = () => {
    setModal(null)
    void reload()
  }
  const open = (m: Modal) => setModal(m)
  const ctx: Ctx = { data, role, userId, open, reload }
  const visibleTabs = TABS.filter((t) => t.id !== 'settings' || role)

  return (
    <div>
      <button type="button" onClick={() => go('groups')} className="pressable mb-3 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All groups
      </button>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('inline-flex size-12 items-center justify-center rounded-2xl text-2xl', c.soft)}>{g.icon}</span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{g.name}</h1>
            <p className="text-sm text-muted-foreground">
              {data.members.filter((m) => !m.removed_at).length} members · {g.currency} · you are {role ? ROLE_LABEL[role].toLowerCase() : 'not a member'}
            </p>
          </div>
        </div>
        {can.write(role) && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => open({ kind: 'tx', type: 'contribution' })}>
              <ArrowDownLeft /> Add savings
            </Button>
            <Button variant="outline" onClick={() => open({ kind: 'tx', type: 'expense' })}>
              <Receipt /> Add expense
            </Button>
            {can.withdraw(role, g) && (
              <Button variant="outline" onClick={() => open({ kind: 'tx', type: 'withdrawal' })}>
                <ArrowUpRight /> Withdraw
              </Button>
            )}
          </div>
        )}
      </div>
      {g.description && <p className="-mt-2 mb-5 max-w-2xl text-sm text-muted-foreground">{g.description}</p>}

      {/* Tabs (hash-routed so each view is linkable) */}
      <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Group sections">
        <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go('groups', g.id, t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150', tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {t.label}
              {t.id === 'transactions' && can.manage(role) && groupTotals(data).pending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-upcoming-soft px-1.5 text-[10px] text-upcoming">{groupTotals(data).pending.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'overview' && <Overview {...ctx} />}
      {tab === 'transactions' && <Transactions {...ctx} />}
      {tab === 'goals' && <Goals {...ctx} />}
      {tab === 'members' && <Members {...ctx} />}
      {tab === 'reports' && <Reports {...ctx} />}
      {tab === 'activity' && <ActivityLog {...ctx} />}
      {tab === 'settings' && <Settings {...ctx} edit={() => open({ kind: 'edit' })} />}

      <ResponsiveModal
        open={!!modal}
        onOpenChange={(o) => !o && setModal(null)}
        title={
          modal?.kind === 'tx' ? (modal.type === 'contribution' ? 'Add savings' : modal.type === 'expense' ? 'Add group expense' : 'Withdraw money')
          : modal?.kind === 'goal' ? (modal.goal ? 'Edit goal' : 'New savings goal')
          : modal?.kind === 'invite' ? `Invite to ${g.name}`
          : modal?.kind === 'correct' ? 'Correct transaction'
          : modal?.kind === 'cancel' ? 'Cancel transaction'
          : modal?.kind === 'edit' ? 'Group settings'
          : ''
        }
      >
        {modal?.kind === 'tx' && role && <GroupTxForm data={data} role={role} userId={userId} initialType={modal.type} initialGoalId={modal.goalId} onDone={done} />}
        {modal?.kind === 'goal' && <GoalForm groupId={g.id} goal={modal.goal} currency={g.currency} onDone={done} />}
        {modal?.kind === 'invite' && role && <InviteForm group={g} role={role} onDone={done} />}
        {modal?.kind === 'correct' && <CorrectForm tx={modal.tx} currency={g.currency} onDone={done} />}
        {modal?.kind === 'cancel' && <CancelForm tx={modal.tx} currency={g.currency} onDone={done} />}
        {modal?.kind === 'edit' && <GroupForm group={g} defaultCurrency={g.currency} onDone={done} />}
      </ResponsiveModal>
    </div>
  )
}

type Ctx = { data: GroupData; role?: GroupRole; userId: string; open: (m: Modal) => void; reload: () => Promise<void> | void }

// ------------------------------------------------------------------ overview

function Overview({ data, role, userId, open }: Ctx) {
  const g = data.group
  const t = groupTotals(data)
  const m = memberSummary(data)
  const cur = g.currency
  const goals = data.goals.filter((x) => !x.archived_at)
  const recent = data.transactions.slice(0, 6)
  const mine = m.find((x) => x.userId === userId)

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-2xl bg-hero text-hero-fg ring-1 ring-white/5" aria-label="Group balance">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs text-hero-fg/60">Money in the group now</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight tabular sm:text-5xl">{moneyIn(t.balance, cur)}</div>
            {mine && (
              <div className="mt-2 text-xs text-hero-fg/60">
                Your savings: <span className="font-medium text-hero-fg tabular">{moneyIn(mine.saved, cur)}</span>
                {mine.withdrawn > 0 && <> · you took out {moneyIn(mine.withdrawn, cur)}</>}
              </div>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-4 border-t border-hero-fg/10 pt-4 text-xs lg:gap-0 lg:border-t-0 lg:pt-0 lg:[&>div]:border-l lg:[&>div]:border-hero-fg/10 lg:[&>div]:px-6 lg:[&>div:last-child]:pr-0">
            <div>
              <dt className="text-hero-fg/60">Saved in total</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular lg:text-base">{moneyIn(t.contributed, cur)}</dd>
            </div>
            <div>
              <dt className="text-hero-fg/60">Withdrawn</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular lg:text-base">{moneyIn(t.withdrawn, cur)}</dd>
            </div>
            <div>
              <dt className="text-hero-fg/60">Group expenses</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular lg:text-base">{moneyIn(t.expenses, cur)}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-hero-fg/10 px-5 py-3">
          {[
            can.write(role) && { label: 'Add savings', icon: ArrowDownLeft, on: () => open({ kind: 'tx', type: 'contribution' }), chip: 'bg-income-soft text-income' },
            can.write(role) && { label: 'Add expense', icon: Receipt, on: () => open({ kind: 'tx', type: 'expense' }), chip: 'bg-expense-soft text-expense' },
            can.write(role) && can.withdraw(role, g) && { label: 'Withdraw money', icon: ArrowUpRight, on: () => open({ kind: 'tx', type: 'withdrawal' }), chip: 'bg-upcoming-soft text-upcoming' },
            { label: 'View members', icon: Users, on: () => go('groups', g.id, 'members'), chip: 'bg-bill-soft text-bill' },
            can.manage(role) && { label: 'Invite member', icon: UserPlus, on: () => open({ kind: 'invite' }), chip: 'bg-debt-soft text-debt' },
            { label: 'All transactions', icon: FileText, on: () => go('groups', g.id, 'transactions'), chip: 'bg-transfer-soft text-transfer' },
          ]
            .filter(Boolean)
            .map((a) => {
              const x = a as { label: string; icon: typeof Users; on: () => void; chip: string }
              const Icon = x.icon
              return (
                <button key={x.label} type="button" onClick={x.on} className="pressable flex items-center gap-2 rounded-full bg-hero-fg/6 py-1.5 pr-3.5 pl-1.5 text-sm font-medium text-hero-fg/85 hover:bg-hero-fg/12 hover:text-hero-fg">
                  <span className={cn('inline-flex size-7 items-center justify-center rounded-full [&_svg]:size-3.5', x.chip)}>
                    <Icon />
                  </span>
                  {x.label}
                </button>
              )
            })}
        </div>
      </section>

      {can.manage(role) && t.pending.length > 0 && <PendingApprovals data={data} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current balance" value={moneyIn(t.balance, cur)} tone="income" />
        <Stat label="Total saved" value={moneyIn(t.contributed, cur)} tone="saving" hint={`${data.transactions.filter((x) => x.type === 'contribution' && x.status === 'approved').length} contributions`} />
        <Stat label="Taken out" value={moneyIn(t.withdrawn + t.expenses, cur)} tone="expense" hint={`${moneyIn(t.expenses, cur)} on group expenses`} />
        <Stat label="Members" value={String(t.activeMembers.length)} tone="bill" hint={`${t.pending.length} waiting for approval`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <MemberTable data={data} />
        <Panel
          title="Savings goals"
          action={
            <Button variant="ghost" size="sm" onClick={() => go('groups', g.id, 'goals')}>
              All goals
            </Button>
          }
        >
          {goals.length ? (
            <div className="grid gap-4">
              {goals.slice(0, 3).map((goal) => {
                const p = goalProgress(data, goal)
                return (
                  <div key={goal.id}>
                    <div className="mb-1 flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{goal.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular">
                        {moneyIn(p.balance, cur)}
                        {p.target ? ` of ${moneyIn(p.target, cur)}` : ''}
                      </span>
                    </div>
                    {p.pct !== null ? <Bar value={p.pct} tone="saving" /> : <div className="text-[11px] text-muted-foreground">Open-ended fund</div>}
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>
              {can.manage(role) ? (
                <Button variant="outline" size="sm" onClick={() => open({ kind: 'goal' })}>
                  <Target /> Create a savings goal
                </Button>
              ) : (
                'No goals yet. Savings go to the general fund.'
              )}
            </Empty>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        action={
          <Button variant="ghost" size="sm" onClick={() => go('groups', g.id, 'transactions')}>
            View all
          </Button>
        }
        bodyClassName="px-3"
      >
        {recent.length ? recent.map((x) => <TxRow key={x.id} tx={x} data={data} compact />) : <Empty>No money recorded yet. Start with “Add savings”.</Empty>}
      </Panel>
    </div>
  )
}

function MemberTable({ data }: { data: GroupData }) {
  const cur = data.group.currency
  const rows = memberSummary(data).filter((r) => r.member && (!r.member.removed_at || r.count > 0))
  const tot = rows.reduce((a, r) => ({ saved: a.saved + r.saved, withdrawn: a.withdrawn + r.withdrawn, net: a.net + r.net }), { saved: 0, withdrawn: 0, net: 0 })
  const t = groupTotals(data)
  return (
    <Panel title="Who put in what" description="Personal withdrawals belong to the member who took them. Group expenses are shared and shown separately." bodyClassName="px-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-5 py-2 font-medium">Member</th>
              <th className="py-2 text-right font-medium">Saved</th>
              <th className="py-2 text-right font-medium">Withdrawn</th>
              <th className="px-5 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b">
                <td className="px-5 py-2.5">
                  <span className="font-medium">{r.name}</span>
                  {r.member?.removed_at && <span className="ml-1.5 text-xs text-muted-foreground">(left)</span>}
                </td>
                <td className="py-2.5 text-right tabular">{moneyIn(r.saved, cur)}</td>
                <td className="py-2.5 text-right tabular">{moneyIn(r.withdrawn, cur)}</td>
                <td className="px-5 py-2.5 text-right font-medium tabular">{moneyIn(r.net, cur)}</td>
              </tr>
            ))}
            <tr className="border-b font-semibold">
              <td className="px-5 py-2.5">Total</td>
              <td className="py-2.5 text-right tabular">{moneyIn(tot.saved, cur)}</td>
              <td className="py-2.5 text-right tabular">{moneyIn(tot.withdrawn, cur)}</td>
              <td className="px-5 py-2.5 text-right tabular">{moneyIn(tot.net, cur)}</td>
            </tr>
            <tr className="text-muted-foreground">
              <td className="px-5 py-2.5" colSpan={3}>
                − Group expenses (shared)
              </td>
              <td className="px-5 py-2.5 text-right tabular">{moneyIn(-t.expenses, cur)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="px-5 pt-1 pb-3" colSpan={3}>
                = Money in the group
              </td>
              <td className="px-5 pt-1 pb-3 text-right tabular">{moneyIn(t.balance, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function PendingApprovals({ data }: { data: GroupData }) {
  const t = groupTotals(data)
  const cur = data.group.currency
  const [busy, setBusy] = useState<string | null>(null)
  const decide = async (tx: GroupTx, ok: boolean) => {
    setBusy(tx.id)
    try {
      await groupApi.decide(tx.id, ok)
      toast.success(ok ? 'Approved' : 'Declined')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <Panel title="Waiting for your approval" description={`Balance available: ${moneyIn(t.balance, cur)}. Approving a withdrawal takes money out of the group.`} className="ring-upcoming/40">
      <ul className="divide-y">
        {t.pending.map((tx) => (
          <li key={tx.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {memberName(data, tx.member_id)} · {TYPE_LABEL[tx.type].toLowerCase()} of <span className="tabular">{moneyIn(tx.amount, cur)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {fmt(tx.occurred_on, 'd MMM yyyy')}
                {tx.description ? ` · ${tx.description}` : ''}
              </div>
              {tx.type !== 'contribution' && tx.amount > t.balance && <div className="text-xs text-expense">Not enough money in the group to approve this yet.</div>}
            </div>
            <Button size="sm" variant="ghost" disabled={busy === tx.id} onClick={() => decide(tx, false)}>
              <X /> Decline
            </Button>
            <Button size="sm" className="bg-income text-white hover:bg-income/90" disabled={busy === tx.id || (tx.type !== 'contribution' && tx.amount > t.balance)} onClick={() => decide(tx, true)}>
              <Check /> Approve
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ------------------------------------------------------------------ transactions

const TYPE_TONE: Record<GroupTxType, { chip: string; icon: typeof Users; sign: string }> = {
  contribution: { chip: 'bg-income-soft text-income', icon: ArrowDownLeft, sign: '+' },
  expense: { chip: 'bg-expense-soft text-expense', icon: Receipt, sign: '−' },
  withdrawal: { chip: 'bg-upcoming-soft text-upcoming', icon: ArrowUpRight, sign: '−' },
}
const STATUS_TONE: Record<GroupTx['status'], string> = {
  approved: 'bg-income-soft text-income',
  pending: 'bg-upcoming-soft text-upcoming',
  rejected: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
}

function TxRow({ tx, data, compact, ctx }: { tx: GroupTx; data: GroupData; compact?: boolean; ctx?: Ctx }) {
  const tone = TYPE_TONE[tx.type]
  const Icon = tone.icon
  const cur = data.group.currency
  const goal = data.goals.find((g) => g.id === tx.goal_id)
  const closed = tx.status === 'cancelled' || tx.status === 'rejected'
  const canEdit = ctx && (can.manage(ctx.role) || (ctx.role === 'member' && tx.created_by === ctx.userId)) && (tx.status === 'approved' || tx.status === 'pending')
  const [opening, setOpening] = useState(false)
  const openReceipt = async () => {
    if (!tx.receipt_path) return
    setOpening(true)
    try {
      window.open(await groupApi.receiptUrl(tx.receipt_path), '_blank', 'noopener')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOpening(false)
    }
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-2', compact ? 'py-2' : 'py-3')}>
      <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4', tone.chip, closed && 'opacity-50')}>
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm font-medium', closed && 'text-muted-foreground line-through')}>
          {tx.type === 'expense' ? tx.description || tx.category : `${memberName(data, tx.member_id)} · ${TYPE_LABEL[tx.type].toLowerCase()}`}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{fmt(tx.occurred_on, 'd MMM yyyy')}</span>
          {tx.type === 'expense' && <span>· {tx.category} · by {memberName(data, tx.member_id)}</span>}
          {goal && <span>· {goal.name}</span>}
          {tx.period_date && <span>· for {fmt(tx.period_date, 'd MMM')}</span>}
          {tx.created_by !== tx.member_id && <span>· recorded by {memberName(data, tx.created_by)}</span>}
          {tx.corrects_id && <span className="text-bill">· correction</span>}
        </div>
        {!compact && tx.type !== 'expense' && tx.description && <div className="truncate text-xs text-muted-foreground">{tx.description}</div>}
        {!compact && tx.cancel_reason && <div className="text-xs text-muted-foreground">Reason: {tx.cancel_reason}</div>}
        {!compact && tx.decision_note && <div className="text-xs text-muted-foreground">Note: {tx.decision_note}</div>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn('text-sm font-semibold tabular whitespace-nowrap', tx.type === 'contribution' ? 'text-income' : 'text-foreground', closed && 'text-muted-foreground line-through')}>
          {tone.sign}
          {moneyIn(tx.amount, cur)}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', STATUS_TONE[tx.status])}>{STATUS_LABEL[tx.status]}</span>
      </div>
      {!compact && (tx.receipt_path || canEdit) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Transaction actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {tx.receipt_path && (
              <DropdownMenuItem onClick={openReceipt} disabled={opening}>
                <FileText /> View receipt
              </DropdownMenuItem>
            )}
            {canEdit && (
              <>
                {tx.receipt_path && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => ctx!.open({ kind: 'correct', tx })}>
                  <Pencil /> Correct…
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => ctx!.open({ kind: 'cancel', tx })}>
                  <X /> Cancel…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function Transactions(ctx: Ctx) {
  const { data, role } = ctx
  const [type, setType] = useState('all')
  const [member, setMember] = useState('all')
  const [status, setStatus] = useState('all')
  const rows = data.transactions.filter((t) => (type === 'all' || t.type === type) && (member === 'all' || t.member_id === member) && (status === 'all' || t.status === status))
  const t = groupTotals(data)
  return (
    <div className="grid gap-5">
      {can.manage(role) && t.pending.length > 0 && <PendingApprovals data={data} />}
      <Panel bodyClassName="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <Filter value={type} onChange={setType} all="All types" options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ v, l }))} />
          <Filter value={member} onChange={setMember} all="All members" options={data.members.map((m) => ({ v: m.user_id, l: memberName(data, m.user_id) }))} />
          <Filter value={status} onChange={setStatus} all="All statuses" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l }))} />
          <Button variant="outline" onClick={() => exportGroupCsv(data)}>
            <Download /> Export CSV
          </Button>
        </div>
      </Panel>
      <Panel bodyClassName="px-3 pt-2" title={`${rows.length} transaction${rows.length === 1 ? '' : 's'}`} description="Cancelled and corrected records stay visible so the history is never lost.">
        {rows.length ? <div className="divide-y">{rows.map((x) => <TxRow key={x.id} tx={x} data={data} ctx={ctx} />)}</div> : <Empty>Nothing matches these filters.</Empty>}
      </Panel>
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
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ------------------------------------------------------------------ goals

function Goals(ctx: Ctx) {
  const { data, role, open } = ctx
  const goals = data.goals.filter((g) => !g.archived_at)
  const cur = data.group.currency
  return (
    <div className="grid gap-5">
      {can.manage(role) && (
        <div className="flex justify-end">
          <Button onClick={() => open({ kind: 'goal' })}>
            <Plus /> New goal
          </Button>
        </div>
      )}
      {!goals.length && <Empty>No savings goals yet. Without a goal, savings go to the group's general fund.</Empty>}
      <div className="grid gap-5 lg:grid-cols-2">
        {goals.map((goal) => {
          const p = goalProgress(data, goal)
          const rec = goal.kind === 'recurring' ? recurringStatus(data, goal) : null
          return (
            <Panel
              key={goal.id}
              title={
                <span className="flex items-center gap-2">
                  {goal.kind === 'recurring' ? <Repeat className="size-4 text-saving" /> : <Target className="size-4 text-saving" />}
                  {goal.name}
                </span>
              }
              description={goal.kind === 'recurring' ? `${FREQ_LABEL[goal.frequency!]}${goal.frequency === 'custom' ? ` (${goal.interval_days} days)` : ''} · ${moneyIn(goal.contribution_amount ?? 0, cur)} each · from ${fmt(goal.start_date!, 'd MMM yyyy')}${goal.end_date ? ` to ${fmt(goal.end_date, 'd MMM yyyy')}` : ''}` : 'Save any time'}
              action={
                can.manage(role) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${goal.name} options`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => open({ kind: 'goal', goal })}>
                        <Pencil /> Edit goal
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={async () => {
                          try {
                            await groupApi.archiveGoal(goal.id)
                            toast('Goal archived — its money and history stay in the group')
                          } catch (e) {
                            toast.error((e as Error).message)
                          }
                        }}
                      >
                        <X /> Archive goal
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
            >
              <div className="grid gap-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold tabular">{moneyIn(p.balance, cur)}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.target ? `of ${moneyIn(p.target, cur)} · ${moneyIn(p.remaining ?? 0, cur)} to go` : 'Open-ended fund'}
                      {p.spent > 0 && ` · ${moneyIn(p.spent, cur)} used`}
                    </div>
                  </div>
                  {p.pct !== null && <span className="text-sm font-semibold text-saving tabular">{Math.round(p.pct * 100)}%</span>}
                </div>
                {p.pct !== null && <Bar value={p.pct} tone="saving" className="h-2" />}

                {rec && rec.periods.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">Who has paid (latest periods)</div>
                    <div className="overflow-x-auto">
                      <table className="text-xs">
                        <thead>
                          <tr>
                            <th className="pr-3 text-left font-medium text-muted-foreground">Member</th>
                            {rec.periods.slice(-6).map((r) => (
                              <th key={r.period} className="px-1.5 font-medium whitespace-nowrap text-muted-foreground">
                                {fmt(r.period, goal.frequency === 'monthly' ? 'MMM' : 'd MMM')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rec.payers.map((m) => (
                            <tr key={m.user_id}>
                              <td className="py-1 pr-3 whitespace-nowrap">{memberName(data, m.user_id)}</td>
                              {rec.periods.slice(-6).map((r) => {
                                const s = r.members.find((x) => x.userId === m.user_id)!
                                return (
                                  <td key={r.period} className="px-1.5 text-center">
                                    <span
                                      title={s.done ? `Paid ${moneyIn(s.paid, cur)}` : s.pending ? 'Waiting for confirmation' : s.paid > 0 ? `Part paid ${moneyIn(s.paid, cur)}` : 'Not paid yet'}
                                      className={cn(
                                        'inline-flex size-6 items-center justify-center rounded-md',
                                        s.done ? 'bg-income-soft text-income' : s.pending ? 'bg-upcoming-soft text-upcoming' : s.paid > 0 ? 'bg-upcoming-soft text-upcoming' : 'bg-muted text-muted-foreground',
                                      )}
                                    >
                                      {s.done ? <Check className="size-3.5" /> : s.pending ? '…' : s.paid > 0 ? '½' : '–'}
                                    </span>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Due payments are reminders only — money is added when someone records it.</p>
                  </div>
                )}

                {p.byMember.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">Saved by member</div>
                    <ul className="grid gap-1.5">
                      {p.byMember.map((b) => (
                        <li key={b.userId} className="flex justify-between text-sm">
                          <span>{b.name}</span>
                          <span className="tabular">{moneyIn(b.amount, cur)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {can.write(role) && (
                  <Button variant="outline" size="sm" className="justify-self-start" onClick={() => open({ kind: 'tx', type: 'contribution', goalId: goal.id })}>
                    <ArrowDownLeft /> {goal.kind === 'recurring' ? 'Pay this period' : 'Add savings'}
                  </Button>
                )}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ members

function Members({ data, role, userId, open }: Ctx) {
  const cur = data.group.currency
  const summary = memberSummary(data)
  const active = data.members.filter((m) => !m.removed_at)
  const openInvites = data.invitations.filter((i) => !i.accepted_at && !i.revoked_at && !i.declined_at)
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="grid gap-5">
      {can.manage(role) && (
        <div className="flex justify-end">
          <Button onClick={() => open({ kind: 'invite' })}>
            <UserPlus /> Invite member
          </Button>
        </div>
      )}
      <Panel title={`${active.length} member${active.length === 1 ? '' : 's'}`} bodyClassName="px-3">
        <ul className="divide-y">
          {active.map((m) => {
            const s = summary.find((x) => x.userId === m.user_id)
            const mine = m.user_id === userId
            const initials = (m.display_name || m.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
            const canChange = can.manage(role) && m.role !== 'owner' && !mine && (role === 'owner' || m.role !== 'admin')
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-2 py-3">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {memberName(data, m.user_id)} {mine && <span className="text-muted-foreground">(you)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.email} · joined {fmt(m.joined_at.slice(0, 10), 'd MMM yyyy')}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="tabular">Saved {moneyIn(s?.saved ?? 0, cur)}</div>
                  <div className="text-muted-foreground tabular">Withdrew {moneyIn(s?.withdrawn ?? 0, cur)}</div>
                </div>
                {canChange ? (
                  <Select value={m.role} onValueChange={(r) => act(() => groupApi.setRole(data.group.id, m.user_id, r as 'admin' | 'member' | 'viewer'), 'Role updated')}>
                    <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${memberName(data, m.user_id)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {role === 'owner' && <SelectItem value="admin">Admin</SelectItem>}
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="w-28 rounded-full bg-muted px-2 py-1 text-center text-xs font-medium">{ROLE_LABEL[m.role]}</span>
                )}
                {canChange && (
                  <Confirm
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Remove ${memberName(data, m.user_id)}`}>
                        <X />
                      </Button>
                    }
                    title={`Remove ${memberName(data, m.user_id)}?`}
                    description="They lose access to the group. Everything they recorded stays in the history and in the totals."
                    confirmLabel="Remove"
                    onConfirm={() => act(() => groupApi.removeMember(data.group.id, m.user_id), 'Member removed')}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </Panel>
      {can.manage(role) && (
        <Panel title="Pending invitations" description="Invitations expire after 7 days and work only once.">
          {openInvites.length ? (
            <ul className="divide-y">
              {openInvites.map((i) => {
                const expired = new Date(i.expires_at) < new Date()
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {ROLE_LABEL[i.role]} · {expired ? <span className="text-expense">expired</span> : `expires ${fmt(i.expires_at.slice(0, 10), 'd MMM')}`}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => act(() => groupApi.revokeInvitation(i.id), 'Invitation cancelled')}>
                      Cancel invite
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => open({ kind: 'invite' })}>
                      Send again
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>No pending invitations.</Empty>
          )}
        </Panel>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ reports

function Reports({ data }: Ctx) {
  const cur = data.group.currency
  const series = monthlySeries(data)
  const cats = Object.entries(expensesByCategory(data)).sort((a, b) => b[1] - a[1])
  const catTotal = cats.reduce((a, [, v]) => a + v, 0)
  const t = groupTotals(data)
  const axis = { tickLine: false, axisLine: false, fontSize: 11, stroke: 'var(--muted-foreground)' }
  const Tip = ({ children }: { children: ReactNode }) => <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">{children}</div>
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Current balance <b className="text-foreground tabular">{moneyIn(t.balance, cur)}</b> · saved in total <b className="text-foreground tabular">{moneyIn(t.contributed, cur)}</b>
        </div>
        <Button variant="outline" onClick={() => exportGroupCsv(data)}>
          <Download /> Export CSV
        </Button>
      </div>
      <MemberTable data={data} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Money in and out by month" description="Savings vs. withdrawals and group expenses (confirmed only)">
          {series.length ? (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 4, right: 0, left: -12, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis tickFormatter={moneyCompact} width={44} {...axis} />
                  <RTooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const r = payload[0].payload as (typeof series)[number]
                      return (
                        <Tip>
                          <div className="mb-1 font-medium">{r.label}</div>
                          <div className="text-income tabular">Saved {moneyIn(r.contributions, cur)}</div>
                          <div className="tabular">Withdrawn {moneyIn(r.withdrawals, cur)}</div>
                          <div className="text-expense tabular">Expenses {moneyIn(r.expenses, cur)}</div>
                        </Tip>
                      )
                    }}
                  />
                  <RBar dataKey="contributions" fill="var(--income)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <RBar dataKey="withdrawals" stackId="out" fill="var(--upcoming)" isAnimationActive={false} />
                  <RBar dataKey="expenses" stackId="out" fill="var(--expense)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>No confirmed money yet.</Empty>
          )}
          <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-income" /> Saved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-upcoming" /> Withdrawn
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-expense" /> Group expenses
            </span>
          </div>
        </Panel>
        <Panel title="Savings growth" description="Group balance at the end of each month">
          {series.length ? (
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis tickFormatter={moneyCompact} width={44} {...axis} />
                  <RTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const r = payload[0].payload as (typeof series)[number]
                      return (
                        <Tip>
                          <div className="font-medium">{r.label}</div>
                          <div className="tabular">Balance {moneyIn(r.balance, cur)}</div>
                        </Tip>
                      )
                    }}
                  />
                  <Line type="monotone" dataKey="balance" stroke="var(--saving)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>No confirmed money yet.</Empty>
          )}
        </Panel>
      </div>
      <Panel title="Group expenses by category" description={catTotal ? `${moneyIn(catTotal, cur)} spent on the group` : undefined}>
        {cats.length ? (
          <ul className="grid gap-3">
            {cats.map(([c, v]) => (
              <li key={c}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{c}</span>
                  <span className="tabular">
                    <span className="mr-2 text-xs text-muted-foreground">{Math.round((v / catTotal) * 100)}%</span>
                    {moneyIn(v, cur)}
                  </span>
                </div>
                <Bar value={v / cats[0][1]} tone="expense" />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No group expenses yet.</Empty>
        )}
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------------ activity

function describe(a: GroupActivity, d: GroupData) {
  const who = memberName(d, a.actor_id)
  const amt = typeof a.details.amount !== 'undefined' ? moneyIn(Number(a.details.amount), d.group.currency) : ''
  const forWhom = a.details.member_id && a.details.member_id !== a.actor_id ? ` for ${memberName(d, a.details.member_id as string)}` : ''
  switch (a.action) {
    case 'group_created': return `${who} created the group`
    case 'group_updated': return `${who} updated the group settings`
    case 'group_archived': return `${who} archived the group`
    case 'member_invited': return `${who} invited ${a.details.email} as ${String(a.details.role)}`
    case 'invitation_revoked': return `${who} cancelled the invitation for ${a.details.email}`
    case 'invitation_declined': return `${a.details.email} declined the invitation`
    case 'member_joined': return `${a.details.name ?? who} joined the group`
    case 'member_left': return `${who} left the group`
    case 'member_removed': return `${who} removed ${memberName(d, a.details.user_id as string)}`
    case 'role_changed': return `${who} changed ${memberName(d, a.details.user_id as string)} from ${a.details.from} to ${a.details.to}`
    case 'goal_created': return `${who} created the goal “${a.details.name}”`
    case 'goal_updated': return `${who} edited the goal “${a.details.name}”`
    case 'goal_archived': return `${who} archived the goal “${a.details.name}”`
    case 'contribution_added': return `${who} added ${amt} savings${forWhom}`
    case 'contribution_requested': return `${who} recorded ${amt} savings, waiting for confirmation`
    case 'expense_added': return `${who} recorded a ${amt} group expense (${a.details.category})`
    case 'withdrawal_added': return `${who} withdrew ${amt}${forWhom}`
    case 'withdrawal_requested': return `${who} asked to withdraw ${amt}`
    case 'transaction_approved': return `${who} approved a ${amt} ${String(a.details.type)}`
    case 'transaction_rejected': return `${who} declined a ${amt} ${String(a.details.type)}`
    case 'transaction_cancelled': return `${who} cancelled a ${amt} ${String(a.details.type)} — “${a.details.reason}”`
    case 'transaction_corrected': return `${who} corrected ${moneyIn(Number(a.details.from_amount), d.group.currency)} to ${moneyIn(Number(a.details.to_amount), d.group.currency)}${a.details.reason ? ` — “${a.details.reason}”` : ''}`
    default: return `${who}: ${a.action.replace(/_/g, ' ')}`
  }
}

function ActivityLog({ data }: Ctx) {
  return (
    <Panel title="Activity history" description="Every change in the group, newest first. Nothing is ever deleted.">
      {data.activity.length ? (
        <ol className="relative grid gap-4 border-l pl-5">
          {data.activity.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-foreground/30 ring-4 ring-card" aria-hidden />
              <div className="text-sm">{describe(a, data)}</div>
              <div className="text-xs text-muted-foreground">{fmt(a.created_at.slice(0, 10), 'd MMM yyyy')} · {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No activity yet.</Empty>
      )}
    </Panel>
  )
}

// ------------------------------------------------------------------ settings

function Settings({ data, role, userId, edit }: Ctx & { edit: () => void }) {
  const g = data.group
  const modeText = { direct: 'Members can withdraw straight away', approval: 'Withdrawals need admin approval', admins_only: 'Only admins can withdraw' }[g.withdrawal_mode]
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="Group details"
        action={
          can.manage(role) && (
            <Button variant="outline" size="sm" onClick={edit}>
              <Pencil /> Edit
            </Button>
          )
        }
      >
        <dl className="grid gap-2.5 text-sm">
          <Row k="Name" v={`${g.icon} ${g.name}`} />
          <Row k="Currency" v={g.currency} />
          <Row k="Withdrawals" v={modeText} />
          <Row k="Savings" v={g.contributions_need_confirmation ? 'Admins confirm members’ savings' : 'Count as soon as they are added'} />
          <Row k="Created" v={fmt(g.created_at.slice(0, 10), 'd MMM yyyy')} />
        </dl>
      </Panel>
      <Panel title="Roles">
        <ul className="grid gap-2 text-sm">
          <li>
            <b>Owner / Admin</b> — manage settings, invite and remove members, manage goals, approve withdrawals, correct any transaction.
          </li>
          <li>
            <b>Member</b> — see everything, add savings and group expenses, withdraw according to the rule above, correct their own entries.
          </li>
          <li>
            <b>Viewer</b> — see everything; can't add or change money.
          </li>
        </ul>
      </Panel>
      <Panel title="Leave or archive" className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          {role === 'owner' ? (
            <Confirm
              trigger={<Button variant="destructive">Archive group</Button>}
              title={`Archive ${g.name}?`}
              description="No one can add money any more. All records stay readable for every member."
              confirmLabel="Archive"
              onConfirm={async () => {
                try {
                  await groupApi.archiveGroup(g.id)
                  toast('Group archived')
                  go('groups')
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            />
          ) : role ? (
            <Confirm
              trigger={<Button variant="destructive">Leave group</Button>}
              title={`Leave ${g.name}?`}
              description="You'll lose access. What you recorded stays in the group's history and totals."
              confirmLabel="Leave"
              onConfirm={async () => {
                try {
                  await groupApi.removeMember(g.id, userId)
                  toast('You left the group')
                  go('groups')
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            />
          ) : null}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleCheck className="size-3.5" /> Group money is never mixed with anyone's personal finances.
          </span>
        </div>
      </Panel>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  )
}
