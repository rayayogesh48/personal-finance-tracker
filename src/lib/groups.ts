/**
 * Groups — shared savings & expenses, backed entirely by Supabase.
 * Reads go straight to tables (RLS limits them to the caller's groups).
 * Every write goes through a database function that checks roles, locks the
 * group and keeps the balance from going negative.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, addMonths, format, parseISO } from 'date-fns'
import { APP_URL, supabase } from './supabase'
import type { Currency } from './types'

// ------------------------------------------------------------------ types

export type GroupRole = 'owner' | 'admin' | 'member' | 'viewer'
export type WithdrawalMode = 'direct' | 'approval' | 'admins_only'
export type GroupTxType = 'contribution' | 'withdrawal' | 'expense'
export type GroupTxStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface Group {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  currency: Currency
  owner_id: string
  withdrawal_mode: WithdrawalMode
  contributions_need_confirmation: boolean
  archived_at: string | null
  created_at: string
}

export interface GroupMember {
  group_id: string
  user_id: string
  role: GroupRole
  display_name: string | null
  email: string | null
  joined_at: string
  removed_at: string | null
}

export interface GroupInvitation {
  id: string
  group_id: string
  email: string
  role: Exclude<GroupRole, 'owner'>
  created_at: string
  expires_at: string
  accepted_at: string | null
  declined_at: string | null
  revoked_at: string | null
  last_sent_at: string | null
}

export interface GroupGoal {
  id: string
  group_id: string
  name: string
  description: string | null
  kind: 'one_time' | 'recurring'
  target_amount: number | null
  contribution_amount: number | null
  frequency: Frequency | null
  interval_days: number | null
  start_date: string | null
  end_date: string | null
  allow_flexible_amounts: boolean
  archived_at: string | null
  created_at: string
}

export interface GroupTx {
  id: string
  group_id: string
  goal_id: string | null
  member_id: string
  created_by: string
  type: GroupTxType
  amount: number
  category: string
  description: string | null
  occurred_on: string
  period_date: string | null
  status: GroupTxStatus
  receipt_path: string | null
  corrects_id: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
}

export interface GroupActivity {
  id: number
  group_id: string
  actor_id: string | null
  action: string
  transaction_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface MyInvitation {
  id: string
  group_id: string
  group_name: string
  group_icon: string
  inviter_name: string
  role: GroupRole
  expires_at: string
}

export interface InvitePreview {
  group_name: string
  group_icon: string
  inviter_name: string
  invited_email: string
  role: GroupRole
  status: 'open' | 'accepted' | 'revoked' | 'declined' | 'expired' | 'archived'
}

export const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }
export const TYPE_LABEL: Record<GroupTxType, string> = { contribution: 'Savings', withdrawal: 'Personal withdrawal', expense: 'Group expense' }
export const STATUS_LABEL: Record<GroupTxStatus, string> = { pending: 'Waiting for approval', approved: 'Confirmed', rejected: 'Declined', cancelled: 'Cancelled' }
export const FREQ_LABEL: Record<Frequency, string> = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month', custom: 'Custom' }
export const GROUP_EXPENSE_CATEGORIES = ['Food', 'Travel', 'Housing', 'Utilities', 'Shopping', 'Transport', 'Entertainment', 'Health', 'Gifts', 'Other']
export const GROUP_COLORS = ['blue', 'green', 'orange', 'violet', 'teal', 'rose', 'slate'] as const
export const GROUP_ICONS = ['👥', '💰', '🏠', '✈️', '❤️', '👨‍👩‍👧', '🎓', '🚗', '🛟', '🎉', '🍽️', '🎁']

// ------------------------------------------------------------------ errors

/** Turn database error codes into plain-language messages. */
export function friendlyError(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const funds = msg.match(/INSUFFICIENT(_GOAL)?_FUNDS:(-?[\d.]+)/)
  if (funds) return `Not enough money in the ${funds[1] ? 'goal' : 'group'}. Only ${Number(funds[2]).toLocaleString('en-IN')} is available.`
  const neg = msg.match(/WOULD_GO_NEGATIVE:(-?[\d.]+)/)
  if (neg) return `Can't cancel this: that money has already been spent (only ${Number(neg[1]).toLocaleString('en-IN')} left in the group).`
  const map: Record<string, string> = {
    NOT_SIGNED_IN: 'Please sign in again.',
    NOT_A_MEMBER: "You're not a member of this group.",
    NOT_ALLOWED: "Your role in this group doesn't allow that.",
    OWNER_ONLY: 'Only the group owner can do that.',
    WITHDRAWALS_ADMIN_ONLY: 'In this group only admins can withdraw money.',
    INVALID_EMAIL: "That email address doesn't look right.",
    ALREADY_MEMBER: 'That person is already in the group.',
    INVITE_USED: 'This invitation has already been used.',
    INVITE_REVOKED: 'This invitation was cancelled.',
    INVITE_EXPIRED: 'This invitation has expired. Ask for a new one.',
    INVITE_NOT_FOUND: "We couldn't find that invitation.",
    INVITE_EMAIL_MISMATCH: 'This invitation was sent to a different email address. Sign in with that email to join.',
    EMAIL_NOT_CONFIRMED: 'Please confirm your email address first.',
    GROUP_ARCHIVED: 'This group has been archived.',
    GOAL_NOT_FOUND: "That savings goal doesn't exist any more.",
    FIXED_AMOUNT: 'This goal uses a fixed amount for each payment.',
    NOT_PENDING: 'This has already been decided.',
    ALREADY_CLOSED: 'This record is already cancelled or declined.',
    REASON_REQUIRED: 'Please give a short reason.',
    CANNOT_REMOVE_OWNER: "The owner can't be removed.",
    CANNOT_CHANGE_OWNER: "The owner's role can't be changed.",
    CURRENCY_LOCKED: "The currency can't change once the group has transactions.",
    INVALID_AMOUNT: 'Enter an amount above zero.',
  }
  for (const [k, v] of Object.entries(map)) if (msg.includes(k)) return v
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Can't reach the server. Check your connection and try again."
  return msg
}

const sb = () => {
  if (!supabase) throw new Error('Cloud is not configured')
  return supabase
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args)
  if (error) throw new Error(friendlyError(error))
  return data as T
}

// ------------------------------------------------------------------ actions

export const groupApi = {
  createGroup: (g: { name: string; description?: string; icon: string; color: string; currency: Currency; withdrawal_mode: WithdrawalMode; contributions_need_confirmation: boolean }) =>
    rpc<string>('create_group', {
      p_name: g.name,
      p_description: g.description ?? null,
      p_icon: g.icon,
      p_color: g.color,
      p_currency: g.currency,
      p_withdrawal_mode: g.withdrawal_mode,
      p_contributions_need_confirmation: g.contributions_need_confirmation,
    }),
  updateGroup: (id: string, g: { name: string; description?: string | null; icon: string; color: string; currency: Currency; withdrawal_mode: WithdrawalMode; contributions_need_confirmation: boolean }) =>
    rpc<void>('update_group', {
      p_group_id: id,
      p_name: g.name,
      p_description: g.description ?? null,
      p_icon: g.icon,
      p_color: g.color,
      p_currency: g.currency,
      p_withdrawal_mode: g.withdrawal_mode,
      p_contributions_need_confirmation: g.contributions_need_confirmation,
    }),
  archiveGroup: (id: string) => rpc<void>('archive_group', { p_group_id: id }),

  /** Creates the invitation and asks the Edge Function to email it. Always returns the join link. */
  async invite(groupId: string, email: string, role: Exclude<GroupRole, 'owner'>) {
    const { data, error } = await sb().functions.invoke('send-group-invite', {
      body: { group_id: groupId, email, role, app_url: APP_URL },
    })
    if (error) {
      // FunctionsHttpError carries the JSON body in context
      let msg = error.message
      try {
        const body = await (error as { context?: Response }).context?.json()
        if (body?.error) msg = body.error
      } catch {
        /* ignore */
      }
      throw new Error(friendlyError(msg))
    }
    return data as { invitation_id: string; link: string; delivered: 'resend' | 'not_sent' | 'failed'; delivery_error?: string; group_name: string; inviter: string; expires_at: string }
  },
  revokeInvitation: (id: string) => rpc<void>('revoke_invitation', { p_invitation_id: id }),
  previewInvitation: async (token: string) => {
    const rows = await rpc<InvitePreview[]>('invitation_preview', { p_token: token })
    return rows[0] ?? null
  },
  myInvitations: () => rpc<MyInvitation[]>('my_invitations', {}),
  acceptInvitation: (token: string) => rpc<string>('accept_invitation', { p_token: token }),
  acceptInvitationById: (id: string) => rpc<string>('accept_invitation_by_id', { p_invitation_id: id }),
  declineInvitation: (id: string) => rpc<void>('decline_invitation', { p_invitation_id: id }),

  setRole: (groupId: string, userId: string, role: Exclude<GroupRole, 'owner'>) => rpc<void>('set_member_role', { p_group_id: groupId, p_user_id: userId, p_role: role }),
  removeMember: (groupId: string, userId: string) => rpc<void>('remove_member', { p_group_id: groupId, p_user_id: userId }),

  saveGoal: (groupId: string, goalId: string | null, g: Omit<GroupGoal, 'id' | 'group_id' | 'archived_at' | 'created_at'>) =>
    rpc<string>('save_group_goal', {
      p_group_id: groupId,
      p_goal_id: goalId,
      p_name: g.name,
      p_description: g.description,
      p_kind: g.kind,
      p_target_amount: g.target_amount,
      p_contribution_amount: g.contribution_amount,
      p_frequency: g.frequency,
      p_interval_days: g.interval_days,
      p_start_date: g.start_date,
      p_end_date: g.end_date,
      p_allow_flexible_amounts: g.allow_flexible_amounts,
    }),
  archiveGoal: (goalId: string) => rpc<void>('archive_group_goal', { p_goal_id: goalId }),

  addTransaction: (t: {
    groupId: string
    type: GroupTxType
    amount: number
    goalId?: string | null
    category?: string
    description?: string
    occurredOn: string
    periodDate?: string | null
    receiptPath?: string | null
    clientRequestId: string
    memberId?: string | null
  }) =>
    rpc<GroupTx>('add_group_transaction', {
      p_group_id: t.groupId,
      p_type: t.type,
      p_amount: t.amount,
      p_goal_id: t.goalId ?? null,
      p_category: t.category ?? 'General',
      p_description: t.description ?? null,
      p_occurred_on: t.occurredOn,
      p_period_date: t.periodDate ?? null,
      p_receipt_path: t.receiptPath ?? null,
      p_client_request_id: t.clientRequestId,
      p_member_id: t.memberId ?? null,
    }),
  decide: (txId: string, approve: boolean, note?: string) => rpc<GroupTx>('decide_group_transaction', { p_transaction_id: txId, p_approve: approve, p_note: note ?? null }),
  cancel: (txId: string, reason: string) => rpc<GroupTx>('cancel_group_transaction', { p_transaction_id: txId, p_reason: reason }),
  correct: (txId: string, c: { amount: number; category: string; description: string; occurredOn: string; reason: string }) =>
    rpc<GroupTx>('correct_group_transaction', {
      p_transaction_id: txId,
      p_amount: c.amount,
      p_category: c.category,
      p_description: c.description,
      p_occurred_on: c.occurredOn,
      p_reason: c.reason,
    }),

  /** Upload a receipt into the group's private folder; returns the storage path. */
  async uploadReceipt(groupId: string, file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error('Receipts must be 10 MB or smaller.')
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${groupId}/${crypto.randomUUID()}.${ext}`
    const { error } = await sb().storage.from('group-receipts').upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(friendlyError(error))
    return path
  },
  async receiptUrl(path: string) {
    const { data, error } = await sb().storage.from('group-receipts').createSignedUrl(path, 60 * 10)
    if (error) throw new Error(friendlyError(error))
    return data.signedUrl
  },
}

// ------------------------------------------------------------------ data hooks

export interface GroupSummary {
  group: Group
  role: GroupRole
  members: number
  balance: number
  pending: number
}

/** All groups the signed-in user belongs to, with balances. */
export function useMyGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [invites, setInvites] = useState<MyInvitation[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !userId) return
    try {
      const [g, m, t, inv] = await Promise.all([
        supabase.from('groups').select('*').is('archived_at', null).order('created_at'),
        supabase.from('group_members').select('group_id,user_id,role').is('removed_at', null),
        supabase.from('group_transactions').select('group_id,type,amount,status').in('status', ['approved', 'pending']),
        groupApi.myInvitations(),
      ])
      if (g.error) throw g.error
      if (m.error) throw m.error
      if (t.error) throw t.error
      const list = (g.data as Group[]).map((group) => {
        const mem = (m.data ?? []).filter((x) => x.group_id === group.id)
        const tx = (t.data ?? []).filter((x) => x.group_id === group.id)
        return {
          group,
          role: (mem.find((x) => x.user_id === userId)?.role ?? 'viewer') as GroupRole,
          members: mem.length,
          balance: tx.filter((x) => x.status === 'approved').reduce((a, x) => a + (x.type === 'contribution' ? 1 : -1) * Number(x.amount), 0),
          pending: tx.filter((x) => x.status === 'pending').length,
        }
      })
      setGroups(list)
      setInvites(inv)
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
      setGroups((g) => g ?? [])
    }
  }, [userId])

  useEffect(() => {
    void load()
    if (!supabase || !userId) return
    const client = supabase
    let t: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(t)
      t = setTimeout(() => void load(), 400)
    }
    const ch = client.channel(`groups-list-${userId}`)
    for (const table of ['groups', 'group_members', 'group_transactions']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    ch.subscribe()
    return () => {
      clearTimeout(t)
      void client.removeChannel(ch)
    }
  }, [load, userId])

  return { groups, invites, error, reload: load }
}

export interface GroupData {
  group: Group
  members: GroupMember[]
  goals: GroupGoal[]
  transactions: GroupTx[]
  activity: GroupActivity[]
  invitations: GroupInvitation[]
}

/** One group's full data, kept live for every member via Realtime. */
export function useGroup(groupId: string | undefined) {
  const [data, setData] = useState<GroupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (!supabase || !groupId || loadingRef.current) return
    loadingRef.current = true
    try {
      const [g, m, goals, tx, act, inv] = await Promise.all([
        supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
        supabase.from('group_members').select('*').eq('group_id', groupId).order('joined_at'),
        supabase.from('group_goals').select('*').eq('group_id', groupId).order('created_at'),
        supabase.from('group_transactions').select('*').eq('group_id', groupId).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('group_activity').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(200),
        supabase.from('group_invitations').select('id,group_id,email,role,created_at,expires_at,accepted_at,declined_at,revoked_at,last_sent_at').eq('group_id', groupId).order('created_at', { ascending: false }),
      ])
      for (const r of [g, m, goals, tx, act]) if (r.error) throw r.error
      if (!g.data) {
        setData(null)
        setError("This group doesn't exist or you're not a member.")
        return
      }
      const num = <T extends object>(rows: T[], keys: (keyof T)[]) =>
        rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keys.includes(k as keyof T) && v !== null ? Number(v) : v])) as T)
      setData({
        group: g.data as Group,
        members: (m.data ?? []) as GroupMember[],
        goals: num((goals.data ?? []) as GroupGoal[], ['target_amount', 'contribution_amount']),
        transactions: num((tx.data ?? []) as GroupTx[], ['amount']),
        activity: (act.data ?? []) as GroupActivity[],
        invitations: (inv.data ?? []) as GroupInvitation[], // admins only (RLS); others get []
      })
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    setLoading(true)
    setData(null)
    void load()
    if (!supabase || !groupId) return
    const client = supabase
    let t: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(t)
      t = setTimeout(() => void load(), 250)
    }
    const ch = client.channel(`group-${groupId}`)
    for (const table of ['group_members', 'group_goals', 'group_transactions', 'group_activity'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, refresh)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, refresh)
    ch.subscribe()
    return () => {
      clearTimeout(t)
      void client.removeChannel(ch)
    }
  }, [groupId, load])

  return { data, error, loading, reload: load }
}

// ------------------------------------------------------------------ calculations

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const approved = (t: GroupTx) => t.status === 'approved'
export const signedAmount = (t: GroupTx) => (t.type === 'contribution' ? t.amount : -t.amount)

export function groupTotals(d: GroupData) {
  const ok = d.transactions.filter(approved)
  const contributed = sum(ok.filter((t) => t.type === 'contribution').map((t) => t.amount))
  const withdrawn = sum(ok.filter((t) => t.type === 'withdrawal').map((t) => t.amount))
  const expenses = sum(ok.filter((t) => t.type === 'expense').map((t) => t.amount))
  const pending = d.transactions.filter((t) => t.status === 'pending')
  return { balance: contributed - withdrawn - expenses, contributed, withdrawn, expenses, pending, activeMembers: d.members.filter((m) => !m.removed_at) }
}

/** Per-member figures. Group expenses are shown separately — they benefit everyone. */
export function memberSummary(d: GroupData) {
  const ok = d.transactions.filter(approved)
  const ids = Array.from(new Set([...d.members.map((m) => m.user_id), ...ok.map((t) => t.member_id)]))
  return ids.map((id) => {
    const mine = ok.filter((t) => t.member_id === id)
    const saved = sum(mine.filter((t) => t.type === 'contribution').map((t) => t.amount))
    const withdrawn = sum(mine.filter((t) => t.type === 'withdrawal').map((t) => t.amount))
    const expensesPaid = sum(mine.filter((t) => t.type === 'expense').map((t) => t.amount))
    const m = d.members.find((x) => x.user_id === id)
    return { userId: id, member: m, name: memberName(d, id), saved, withdrawn, net: saved - withdrawn, expensesPaid, count: mine.length }
  })
}

export function memberName(d: GroupData, userId: string | null | undefined) {
  if (!userId) return 'Someone'
  const m = d.members.find((x) => x.user_id === userId)
  return m?.display_name || m?.email?.split('@')[0] || 'Former member'
}

export function goalProgress(d: GroupData, goal: GroupGoal) {
  const ok = d.transactions.filter((t) => approved(t) && t.goal_id === goal.id)
  const saved = sum(ok.filter((t) => t.type === 'contribution').map((t) => t.amount))
  const spent = sum(ok.filter((t) => t.type !== 'contribution').map((t) => t.amount))
  const balance = saved - spent
  const target = goal.target_amount ?? null
  const byMember = new Map<string, number>()
  for (const t of ok.filter((t) => t.type === 'contribution')) byMember.set(t.member_id, (byMember.get(t.member_id) ?? 0) + t.amount)
  return {
    saved,
    spent,
    balance,
    target,
    remaining: target ? Math.max(0, target - balance) : null,
    pct: target ? Math.min(1, Math.max(0, balance / target)) : null,
    byMember: [...byMember.entries()].map(([userId, amount]) => ({ userId, name: memberName(d, userId), amount })).sort((a, b) => b.amount - a.amount),
    history: d.transactions.filter((t) => t.goal_id === goal.id),
  }
}

/** Period start dates for a recurring goal, from its start up to today (or its end). */
export function goalPeriods(goal: GroupGoal, today = format(new Date(), 'yyyy-MM-dd'), max = 400): string[] {
  if (goal.kind !== 'recurring' || !goal.start_date || !goal.frequency) return []
  const out: string[] = []
  const end = goal.end_date && goal.end_date < today ? goal.end_date : today
  let d = parseISO(goal.start_date)
  let i = 0
  while (format(d, 'yyyy-MM-dd') <= end && i < max) {
    out.push(format(d, 'yyyy-MM-dd'))
    i++
    d =
      goal.frequency === 'daily' ? addDays(parseISO(goal.start_date), i)
      : goal.frequency === 'weekly' ? addDays(parseISO(goal.start_date), i * 7)
      : goal.frequency === 'monthly' ? addMonths(parseISO(goal.start_date), i)
      : addDays(parseISO(goal.start_date), i * (goal.interval_days ?? 1))
  }
  return out
}

/** Who has paid for each period of a recurring goal. Due periods never touch the balance. */
export function recurringStatus(d: GroupData, goal: GroupGoal) {
  const periods = goalPeriods(goal)
  const payers = d.members.filter((m) => !m.removed_at && m.role !== 'viewer')
  const due = goal.contribution_amount ?? 0
  const rows = periods.map((p) => ({
    period: p,
    members: payers.map((m) => {
      const paid = sum(
        d.transactions.filter((t) => t.goal_id === goal.id && t.type === 'contribution' && t.member_id === m.user_id && t.period_date === p && approved(t)).map((t) => t.amount),
      )
      const pending = d.transactions.some((t) => t.goal_id === goal.id && t.type === 'contribution' && t.member_id === m.user_id && t.period_date === p && t.status === 'pending')
      return { userId: m.user_id, name: memberName(d, m.user_id), paid, pending, done: paid >= due && due > 0 }
    }),
  }))
  return { periods: rows, current: periods.at(-1) ?? null, payers }
}

export function monthlySeries(d: GroupData) {
  const ok = d.transactions.filter(approved)
  const months = Array.from(new Set(ok.map((t) => t.occurred_on.slice(0, 7)))).sort()
  let running = 0
  return months.map((m) => {
    const inM = ok.filter((t) => t.occurred_on.startsWith(m))
    const contributions = sum(inM.filter((t) => t.type === 'contribution').map((t) => t.amount))
    const withdrawals = sum(inM.filter((t) => t.type === 'withdrawal').map((t) => t.amount))
    const expenses = sum(inM.filter((t) => t.type === 'expense').map((t) => t.amount))
    running += contributions - withdrawals - expenses
    return { month: m, label: format(parseISO(`${m}-01`), 'MMM yy'), contributions, withdrawals, expenses, balance: running }
  })
}

export function expensesByCategory(d: GroupData) {
  const out: Record<string, number> = {}
  for (const t of d.transactions.filter((t) => approved(t) && t.type === 'expense')) out[t.category] = (out[t.category] ?? 0) + t.amount
  return out
}

export function exportGroupCsv(d: GroupData) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const goal = (id: string | null) => d.goals.find((g) => g.id === id)?.name ?? ''
  const header = ['Transaction ID', 'Group ID', 'Date', 'Recorded at', 'Type', 'Status', 'Amount', 'Currency', 'Member', 'Recorded by', 'Category', 'Goal', 'Period', 'Description', 'Corrects', 'Cancel reason', 'Receipt']
  const rows = [...d.transactions]
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at))
    .map((t) => [t.id, t.group_id, t.occurred_on, t.created_at, TYPE_LABEL[t.type], STATUS_LABEL[t.status], t.amount, d.group.currency, memberName(d, t.member_id), memberName(d, t.created_by), t.category, goal(t.goal_id), t.period_date ?? '', t.description ?? '', t.corrects_id ?? '', t.cancel_reason ?? '', t.receipt_path ? 'yes' : ''])
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${d.group.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.csv` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const can = {
  manage: (r?: GroupRole) => r === 'owner' || r === 'admin',
  write: (r?: GroupRole) => r === 'owner' || r === 'admin' || r === 'member',
  withdraw: (r: GroupRole | undefined, g: Group) => (r === 'owner' || r === 'admin' ? true : r === 'member' && g.withdrawal_mode !== 'admins_only'),
}
