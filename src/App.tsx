import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/app/app-shell'
import { TxProvider } from '@/components/app/tx-dialogs'
import { useEffect } from 'react'
import { StoreProvider, useStore, type Space } from '@/lib/store'
import { SyncProvider, useSync } from '@/lib/cloud'
import { AuthProvider, useAuth } from '@/lib/auth'
import { go } from '@/lib/router'
import { ConflictDialog } from '@/components/app/cloud-ui'
import { Wallet } from 'lucide-react'
import { AUTH_ROUTES, useRoute, type Route } from '@/lib/router'
import { ForgotPage, LoginPage, RegisterPage, ResetPage } from '@/pages/auth'
import { DashboardPage } from '@/pages/dashboard'
import { TransactionsPage } from '@/pages/transactions'
import { IncomePage } from '@/pages/income'
import { BudgetPage } from '@/pages/budget'
import { DebtsPage } from '@/pages/debts'
import { BillsPage } from '@/pages/bills'
import { SavingsPage } from '@/pages/savings'
import { CashFlowPage } from '@/pages/cashflow'
import { InsightsPage } from '@/pages/insights'
import { SettingsPage } from '@/pages/settings'
import { GroupsPage } from '@/pages/groups'
import { InviteGate } from '@/components/groups/invite-gate'

const PAGES: Record<Route, () => React.ReactElement> = {
  dashboard: DashboardPage,
  transactions: TransactionsPage,
  income: IncomePage,
  budget: BudgetPage,
  debts: DebtsPage,
  bills: BillsPage,
  savings: SavingsPage,
  cashflow: CashFlowPage,
  insights: InsightsPage,
  groups: GroupsPage,
  settings: SettingsPage,
  login: LoginPage,
  register: RegisterPage,
  forgot: ForgotPage,
  reset: ResetPage,
}

const AUTH_PAGES = { login: LoginPage, register: RegisterPage, forgot: ForgotPage, reset: ResetPage } as const
const isAuthRoute = (r: Route): r is keyof typeof AUTH_PAGES => AUTH_ROUTES.includes(r)
const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** Signed-in (or demo / local) workspace. */
function Workspace() {
  const route = useRoute()
  const { data } = useStore()
  const { initialLoading } = useSync()
  const Page = PAGES[route]
  const dark = data.settings.theme === 'dark' || (data.settings.theme === 'system' && systemDark())
  return (
    <TxProvider>
      {initialLoading ? (
        <Splash label="Loading your ledger…" />
      ) : (
        <AppShell route={route}>
          <Page />
        </AppShell>
      )}
      <ConflictDialog />
      <InviteGate />
      <Toaster position="top-center" theme={dark ? 'dark' : 'light'} closeButton />
    </TxProvider>
  )
}

function Splash({ label }: { label: string }) {
  // Static on purpose: a loading screen seen on every visit shouldn't animate in.
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
        <Wallet className="size-5" />
      </span>
      {label}
    </div>
  )
}

/** Decides what the visitor may see: auth screens, the demo sandbox, or their own ledger. */
function Gate() {
  const route = useRoute()
  const { configured, ready, session, demo } = useAuth()

  const signedIn = !!session
  const mustLogin = configured && !signedIn && !demo
  const authRoute = isAuthRoute(route)

  useEffect(() => {
    if (!ready) return
    // Signed-in users (and demo visitors) don't need login/register screens — except the password reset step.
    if ((signedIn || demo) && authRoute && route !== 'reset') go('dashboard')
    // Everyone else is sent to sign in.
    else if (mustLogin && !authRoute) go('login')
  }, [ready, signedIn, demo, authRoute, route, mustLogin])

  if (!ready) return <Splash label="Loading…" />

  if (authRoute && (mustLogin || route === 'reset')) {
    const Page = AUTH_PAGES[route]
    return (
      <>
        <Page />
        <Toaster position="top-center" theme={systemDark() ? 'dark' : 'light'} closeButton />
      </>
    )
  }
  if (mustLogin) return <Splash label="Loading…" />

  const space: Space = signedIn
    ? { kind: 'user', id: session!.user.id, name: (session!.user.user_metadata?.name as string | undefined) || undefined }
    : demo
      ? { kind: 'demo' }
      : { kind: 'local' }
  const key = space.kind === 'user' ? `user:${space.id}` : space.kind

  return (
    <StoreProvider key={key} space={space}>
      {space.kind === 'user' ? (
        <SyncProvider>
          <Workspace />
        </SyncProvider>
      ) : (
        <Workspace />
      )}
    </StoreProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <Gate />
      </TooltipProvider>
    </AuthProvider>
  )
}
