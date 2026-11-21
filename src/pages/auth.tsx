import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Check, Eye, EyeOff, Loader2, Mail, MailCheck, ShieldCheck, Smartphone, Wallet, Cloud, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { InviteBanner } from '@/components/groups/invite-gate'
import { APP_URL, supabase } from '@/lib/supabase'
import { go } from '@/lib/router'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ------------------------------------------------------------------ layout

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-hero p-10 text-hero-fg lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-hero-fg text-hero">
            <Wallet className="size-4" />
          </span>
          <span className="text-base font-semibold">PocketLedger</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Know exactly where your money goes.</h2>
          <p className="mt-3 text-sm text-hero-fg/60">Track income, spending, debts and bills — and see what's coming before it happens.</p>
          <ul className="mt-8 grid gap-4 text-sm">
            {[
              { icon: Cloud, t: 'Synced across devices', d: 'Your ledger follows you to your phone and laptop.' },
              { icon: ShieldCheck, t: 'Private by design', d: 'Only you can read your data — enforced by the database.' },
              { icon: Smartphone, t: 'Works offline', d: 'Keep tracking without a connection; it syncs later.' },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-hero-fg/10">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="text-hero-fg/60">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <DemoCard />
      </aside>

      {/* Form */}
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="flex items-center gap-2 text-sm font-semibold lg:hidden">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
              <Wallet className="size-3.5" />
            </span>
            PocketLedger
          </span>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <InviteBanner />
          {children}
        </div>
        <p className="text-center text-xs text-muted-foreground">Your data is private to your account and protected by the database.</p>
      </main>
    </div>
  )
}

/** Left-panel teaser for the demo (large screens). */
function DemoCard() {
  const { startDemo } = useAuth()
  return (
    <button
      type="button"
      onClick={startDemo}
      className="pressable group w-80 rounded-2xl bg-hero-fg/8 p-4 text-left ring-1 ring-hero-fg/10 hover:bg-hero-fg/12"
    >
      <div className="flex items-center gap-2 text-xs text-hero-fg/60">
        <Sparkles className="size-3.5" /> Just looking?
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-base font-semibold">Explore the demo</span>
        <ArrowRight className="size-4 transition-transform duration-200 ease-(--ease-out) group-hover:translate-x-0.5" />
      </div>
      <div className="mt-1 text-xs text-hero-fg/50">Sample data · no account needed · nothing is saved</div>
    </button>
  )
}

/** "or explore the demo" — under every auth form, so it works on mobile too. */
function DemoOption() {
  const { startDemo } = useAuth()
  return (
    <div className="mt-6">
      <div className="relative mb-4 text-center text-xs text-muted-foreground">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
        <span className="relative bg-background px-2">or</span>
      </div>
      <Button type="button" variant="outline" size="lg" className="h-10 w-full" onClick={startDemo}>
        <Sparkles /> Explore with demo data
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">No account needed. Changes in the demo aren't saved.</p>
    </div>
  )
}

function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}

function FieldRow({ label, htmlFor, error, aside, children }: { label: string; htmlFor: string; error?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error && (
        <p className="text-xs text-expense" id={`${htmlFor}-err`}>
          {error}
        </p>
      )}
    </div>
  )
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pr-10"
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function FormError({ text }: { text: string | null }) {
  return (
    <div aria-live="polite">
      {text && <p className="rounded-xl bg-expense-soft px-3 py-2.5 text-sm text-expense">{text}</p>}
    </div>
  )
}

function NotConfigured() {
  return (
    <>
      <Heading title="Cloud sync isn't set up" />
      <p className="text-sm text-muted-foreground">
        Add <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-muted px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code className="rounded bg-muted px-1">.env.local</code> and restart the app.
      </p>
    </>
  )
}

function SignedIn() {
  const { session, signOut } = useAuth()
  return (
    <>
      <Heading title="You're signed in" sub={<>as <b className="text-foreground">{session?.user.email}</b></>} />
      <div className="grid gap-2">
        <Button size="lg" className="h-10" onClick={() => go('dashboard')}>
          Go to dashboard
        </Button>
        <Button size="lg" variant="ghost" className="h-10" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </>
  )
}

/** Friendlier wording for the most common Supabase auth errors. */
function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check them and try again.'
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link we sent.'
  if (/already registered|already been registered/i.test(msg)) return 'An account with this email already exists. Try signing in instead.'
  if (/email rate limit|over_email_send_rate_limit/i.test(msg))
    return "We can't send more emails right now — the email service has reached its hourly limit. Please try again in about an hour."
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.'
  return msg
}

// ------------------------------------------------------------------ login

export function LoginPage() {
  const cloud = useAuth()
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  if (!cloud.configured) return <AuthLayout><NotConfigured /></AuthLayout>
  if (cloud.session) return <AuthLayout><SignedIn /></AuthLayout>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const er: typeof errors = {}
    if (!EMAIL_RE.test(email.trim())) er.email = 'Enter a valid email address'
    if (mode === 'password' && !password) er.password = 'Enter your password'
    setErrors(er)
    setFormError(null)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      if (mode === 'password') {
        const err = await cloud.signIn(email.trim(), password)
        if (err) return setFormError(friendly(err))
        toast.success('Welcome back')
        go('dashboard')
      } else {
        const err = await cloud.magicLink(email.trim())
        if (err) return setFormError(friendly(err))
        setLinkSent(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (linkSent)
    return (
      <AuthLayout>
        <CheckInbox email={email} what="a sign-in link" onBack={() => setLinkSent(false)} />
      </AuthLayout>
    )

  return (
    <AuthLayout>
      <Heading
        title="Sign in"
        sub={
          <>
            New to PocketLedger?{' '}
            <button type="button" onClick={() => go('register')} className="font-medium text-foreground underline underline-offset-4">
              Create an account
            </button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
        {(['password', 'link'] as const).map((m) => (
          <button
            type="button"
            role="tab"
            aria-selected={mode === m}
            key={m}
            onClick={() => {
              setMode(m)
              setFormError(null)
            }}
            className={cn('pressable rounded-lg py-1.5 text-sm font-medium', mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            {m === 'password' ? 'Password' : 'Email link'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FieldRow label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" aria-invalid={!!errors.email} />
        </FieldRow>
        {mode === 'password' ? (
          <FieldRow
            label="Password"
            htmlFor="password"
            error={errors.password}
            aside={
              <button type="button" onClick={() => go('forgot')} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot password?
              </button>
            }
          >
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" invalid={!!errors.password} />
          </FieldRow>
        ) : (
          <p className="-mt-1 text-xs text-muted-foreground">We'll email you a one-time link. Open it on this device to sign in — no password needed.</p>
        )}
        <FormError text={formError} />
        <Button type="submit" size="lg" className="h-10" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {mode === 'password' ? 'Sign in' : (
            <>
              <Mail /> Send sign-in link
            </>
          )}
        </Button>
      </form>
      <DemoOption />
    </AuthLayout>
  )
}

// ------------------------------------------------------------------ register

export function RegisterPage() {
  const cloud = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (!cloud.configured) return <AuthLayout><NotConfigured /></AuthLayout>
  if (cloud.session) return <AuthLayout><SignedIn /></AuthLayout>

  const rules = [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: 'Letters and numbers' },
  ]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (!EMAIL_RE.test(email.trim())) er.email = 'Enter a valid email address'
    if (!rules.every((r) => r.ok)) er.password = 'Choose a stronger password'
    if (confirm !== password) er.confirm = "Passwords don't match"
    setErrors(er)
    setFormError(null)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      const r = await cloud.signUp(email.trim(), password, name.trim() || undefined)
      if (r.error) return setFormError(friendly(r.error))
      if (r.needsConfirm) setSent(true)
      else {
        toast.success('Account created — welcome to PocketLedger')
        go('dashboard')
      }
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <AuthLayout>
        <CheckInbox email={email} what="a confirmation link" resendType="signup" onBack={() => go('login')} backLabel="Go to sign in" />
      </AuthLayout>
    )

  return (
    <AuthLayout>
      <Heading
        title="Create your account"
        sub={
          <>
            Already have one?{' '}
            <button type="button" onClick={() => go('login')} className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </button>
          </>
        }
      />
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FieldRow label="Name" htmlFor="name">
          <Input id="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" maxLength={30} placeholder="Optional" />
        </FieldRow>
        <FieldRow label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" aria-invalid={!!errors.email} />
        </FieldRow>
        <FieldRow label="Password" htmlFor="password" error={errors.password}>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!errors.password} />
          <ul className="mt-1 grid gap-1">
            {rules.map((r) => (
              <li key={r.label} className={cn('flex items-center gap-1.5 text-xs transition-colors duration-150', r.ok ? 'text-income' : 'text-muted-foreground')}>
                <Check className={cn('size-3.5', !r.ok && 'opacity-30')} /> {r.label}
              </li>
            ))}
          </ul>
        </FieldRow>
        <FieldRow label="Confirm password" htmlFor="confirm" error={errors.confirm}>
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={!!errors.confirm} />
        </FieldRow>
        <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">Your account starts empty and ready for your own numbers.</p>
        <FormError text={formError} />
        <Button type="submit" size="lg" className="h-10" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
      <DemoOption />
    </AuthLayout>
  )
}

// ------------------------------------------------------------------ forgot / reset

export function ForgotPage() {
  const cloud = useAuth()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (!cloud.configured) return <AuthLayout><NotConfigured /></AuthLayout>
  if (sent)
    return (
      <AuthLayout>
        <CheckInbox email={email} what="a password reset link" onBack={() => go('login')} backLabel="Back to sign in" />
      </AuthLayout>
    )
  return (
    <AuthLayout>
      <Heading title="Reset your password" sub="Enter your email and we'll send you a link to choose a new password." />
      <form
        className="grid gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (!EMAIL_RE.test(email.trim())) return setErr('Enter a valid email address')
          setBusy(true)
          const r = await cloud.sendReset(email.trim())
          setBusy(false)
          if (r) return setErr(friendly(r))
          setSent(true)
        }}
      >
        <FieldRow label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </FieldRow>
        <FormError text={err} />
        <Button type="submit" size="lg" className="h-10" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Send reset link
        </Button>
        <Button type="button" variant="ghost" onClick={() => go('login')}>
          Back to sign in
        </Button>
      </form>
    </AuthLayout>
  )
}

export function ResetPage() {
  const cloud = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!cloud.configured) return <AuthLayout><NotConfigured /></AuthLayout>
  if (!cloud.session)
    return (
      <AuthLayout>
        <Heading title="Link expired or already used" sub="Request a new password reset link to continue." />
        <Button size="lg" className="h-10 w-full" onClick={() => go('forgot')}>
          Request a new link
        </Button>
      </AuthLayout>
    )
  return (
    <AuthLayout>
      <Heading title="Choose a new password" sub={<>for {cloud.session.user.email}</>} />
      <form
        className="grid gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setErr('Use at least 8 characters with letters and numbers.')
          if (password !== confirm) return setErr("Passwords don't match.")
          setBusy(true)
          const r = await cloud.updatePassword(password)
          setBusy(false)
          if (r) return setErr(friendly(r))
          toast.success('Password updated')
          go('dashboard')
        }}
      >
        <FieldRow label="New password" htmlFor="password">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
        </FieldRow>
        <FieldRow label="Confirm new password" htmlFor="confirm">
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </FieldRow>
        <FormError text={err} />
        <Button type="submit" size="lg" className="h-10" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Update password
        </Button>
      </form>
    </AuthLayout>
  )
}

// ------------------------------------------------------------------ shared

function CheckInbox({ email, what, onBack, backLabel = 'Use a different email', resendType }: { email: string; what: string; onBack: () => void; backLabel?: string; resendType?: 'signup' }) {
  const [resent, setResent] = useState(false)
  return (
    <div>
      <span className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-income-soft text-income">
        <MailCheck className="size-6" />
      </span>
      <Heading title="Check your inbox" sub={<>We sent {what} to <b className="text-foreground">{email}</b>. It can take a minute — check spam too.</>} />
      <div className="grid gap-2">
        {resendType && supabase && (
          <Button
            variant="outline"
            size="lg"
            className="h-10"
            disabled={resent}
            onClick={async () => {
              const { error } = await supabase!.auth.resend({ type: resendType, email, options: { emailRedirectTo: `${APP_URL}/` } })
              if (error) toast.error(friendly(error.message))
              else {
                setResent(true)
                toast.success('Email sent again')
              }
            }}
          >
            {resent ? 'Sent again' : 'Resend email'}
          </Button>
        )}
        <Button variant="ghost" size="lg" className="h-10" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </div>
  )
}
