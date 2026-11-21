import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/app/page'
import { ResponsiveModal } from '@/components/app/responsive-modal'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { pendingInvite } from '@/lib/pending-invite'
import { groupApi, ROLE_LABEL, type InvitePreview } from '@/lib/groups'
import { go } from '@/lib/router'

/** Signed-in: if the user arrived from an invite link, offer to join that group. */
export function InviteGate() {
  const { session, signOut } = useAuth()
  const [token, setToken] = useState<string | null>(() => pendingInvite.get())
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  // People created through an invitation email have no password yet — let them set one here.
  const user = session?.user
  const needsPassword = !!user?.invited_at && user.user_metadata?.password_set !== true

  useEffect(() => {
    if (!session || !token) return
    groupApi
      .previewInvitation(token)
      .then((p) => setPreview(p))
      .catch(() => setPreview(null))
  }, [session, token])

  if (!session || !token || preview === undefined) return null

  const close = () => {
    pendingInvite.clear()
    setToken(null)
  }

  const accept = async () => {
    setErr(null)
    if (needsPassword && password && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)))
      return setErr('Use at least 8 characters with letters and numbers, or leave it empty for now.')
    setBusy(true)
    try {
      if (needsPassword && password && supabase) {
        const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } })
        if (error) throw error
      }
      const gid = await groupApi.acceptInvitation(token)
      close()
      toast.success(`You joined ${preview?.group_name ?? 'the group'}`)
      go('groups', gid)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const status = preview?.status
  const usable = status === 'open'

  return (
    <ResponsiveModal open onOpenChange={(o) => !o && close()} title={usable ? `Join ${preview!.group_name}?` : 'Invitation'}>
      <div className="grid gap-4 pb-2">
        {preview ? (
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-card text-xl">{preview.group_icon}</span>
            <div className="text-sm">
              <div className="font-medium">{preview.group_name}</div>
              <div className="text-xs text-muted-foreground">
                {preview.inviter_name} invited {preview.invited_email} as {ROLE_LABEL[preview.role].toLowerCase()}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">We couldn't find this invitation. The link may be incomplete.</p>
        )}

        {status && status !== 'open' && (
          <p className="rounded-xl bg-upcoming-soft p-3 text-sm text-upcoming">
            {status === 'accepted' && 'This invitation has already been used.'}
            {status === 'expired' && 'This invitation has expired. Ask the group owner to send a new one.'}
            {status === 'revoked' && 'This invitation was cancelled by the group.'}
            {status === 'declined' && 'This invitation was declined.'}
            {status === 'archived' && 'This group has been archived.'}
          </p>
        )}

        {usable && (
          <>
            <p className="text-sm text-muted-foreground">
              You're signed in as <b className="text-foreground">{session.user.email}</b>. Group money is kept separate from your personal finances.
            </p>
            {needsPassword && (
              <Field label="Choose a password (recommended)" hint="So you can sign in again later. You can also use “Email link” sign-in instead.">
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
          </>
        )}

        <div aria-live="polite">
          {err && (
            <div className="grid gap-2 rounded-xl bg-expense-soft p-3 text-sm text-expense">
              {err}
              {/different email/.test(err) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-self-start bg-card"
                  onClick={async () => {
                    await signOut() // keeps the invite token so it resumes after signing in
                  }}
                >
                  Sign out and use the invited email
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={close} disabled={busy}>
            {usable ? 'Not now' : 'Close'}
          </Button>
          {usable && (
            <Button size="lg" onClick={accept} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Users />} Join group
            </Button>
          )}
        </div>
      </div>
    </ResponsiveModal>
  )
}

/** Signed-out: explain the invitation above the sign-in / register form. */
export function InviteBanner() {
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  useEffect(() => {
    const t = pendingInvite.get()
    if (!t) return
    groupApi
      .previewInvitation(t)
      .then((p) => setPreview(p))
      .catch(() => setPreview(null))
  }, [])
  if (!preview || preview.status !== 'open') return null
  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl border bg-income-soft/60 p-3 text-sm">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-lg">{preview.group_icon}</span>
      <div>
        <div className="font-medium">
          {preview.inviter_name} invited you to “{preview.group_name}”
        </div>
        <div className="text-xs text-muted-foreground">Sign in or create an account with {preview.invited_email} to join.</div>
      </div>
    </div>
  )
}
