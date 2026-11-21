# PocketLedger

Simple, private personal finance tracker — React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), Recharts. Data lives in your browser (`localStorage`, key `pocketledger:v1`).

```bash
npm install
npm run dev      # http://localhost:5173 (or the port Vite prints)
npm run build
```

## Cloud sync (Supabase, optional)

Without sign-in the app is local-only. With Supabase configured, users can sign in (email + password, or magic link) and their data syncs to a normalized schema — `profiles`, `user_settings`, `categories`, `accounts`, `debts`, `bills`, `income_sources`, `savings_goals`, `debt_goals`, `budgets`, `transactions` — each protected by Row Level Security so users only ever see their own rows. Only changed rows are sent (diff-based upserts/deletes, ~0.8s debounce), and Realtime keeps other signed-in devices up to date. A trigger creates a `profiles` row on sign-up. If a device and the cloud hold different real data on sign-in, the user chooses which copy to keep.

Setup:

1. Copy `.env.example` → `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Run `supabase/migrations/20261121120000_pocketledger_schema.sql` in the Supabase SQL Editor (or `supabase db push`).
3. In Supabase → Authentication → URL Configuration, add your app URL (e.g. `http://localhost:5174`) to the Redirect URLs so confirmation / magic-link emails return to the app.

## Deploy to Vercel

1. Import this GitHub repo in Vercel (framework preset **Vite**; build `npm run build`, output `dist` — detected automatically).
2. In **Vercel → Project → Settings → Environment Variables**, add for Production (and Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Deploy, then in **Supabase → Authentication → URL Configuration**:
   - set **Site URL** to your Vercel URL (e.g. `https://your-app.vercel.app`)
   - add `https://your-app.vercel.app` (and `https://*-your-team.vercel.app` for previews) to **Redirect URLs**
4. Visitors must create an account (or sign in) before using the app; the demo is available from the sign-in page and never saves.

Routing uses the URL hash (`#/dashboard`), so no rewrite rules are needed.

## Money rules

| Number | How it's calculated |
| --- | --- |
| **Balance (actual)** | account opening balances + completed income − completed outflows |
| **Reserved** | planned outflows marked "Reserve the cash" |
| **Available** | actual − reserved |
| **Forecast** | actual + every planned item in date order (overdue planned items count as due today) |
| **Monthly projection** | opening + expected income − planned outflows = projected closing |

- Statuses: **Completed / Planned / Cancelled**. Only completed transactions move the balance.
- "Paid from outside" items never touch the balance or forecast. Optional planned expenses can be toggled out of the forecast.
- Debt balances fall only when a repayment is completed. Partial payments can keep the remainder planned.
- Debt payoff goal: repayments planned on/before the target date are the priority portion; later ones are tracked separately.
- Budgets are monthly limits that reset each month; only completed spending counts.

## Demo data

First launch loads clearly-labelled sample data (see `src/lib/seed.ts`). Nothing in the app logic references it — use **Start fresh** (banner or Settings) to clear it, or **Reset demo data** to bring it back.

## Structure

- `src/lib/types.ts` — data model
- `src/lib/finance.ts` — all calculations (balances, forecast, budgets, debts, bills, goals, alerts, insights)
- `src/lib/schedule.ts` — recurring income / bill / EMI schedule generation (amortised EMI formula)
- `src/lib/store.tsx` — state, persistence, theme
- `src/pages/*` — Dashboard, Transactions, Income, Budget, Debts, Bills & EMI, Savings, Cash flow, Insights, Settings
