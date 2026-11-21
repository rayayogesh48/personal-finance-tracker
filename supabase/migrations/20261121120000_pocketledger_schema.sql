-- =====================================================================
-- PocketLedger — normalized schema (one table per kind of data)
-- Run in Supabase → SQL Editor, `supabase db push`, or via the Supabase MCP.
-- Every table is private per user via Row Level Security.
-- =====================================================================

-- Earlier single-document prototype (safe to remove; never held data).
drop table if exists public.ledgers cascade;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. profiles — account creation data (one row per auth user)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Create a profile automatically when someone registers (settings are written by the app on first sync).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only: never callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. user_settings — preferences (one row per user)
-- ---------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id                     uuid primary key references auth.users (id) on delete cascade,
  currency                    text    not null default 'NPR' check (currency in ('NPR','USD','INR','GBP','EUR')),
  date_format                 text    not null default 'd MMM yyyy',
  theme                       text    not null default 'system' check (theme in ('light','dark','system')),
  monthly_budget              numeric(14,2) not null default 0 check (monthly_budget >= 0),
  budget_warn_pct             integer not null default 80 check (budget_warn_pct between 1 and 100),
  include_optional_in_forecast boolean not null default true,
  notify_enabled              boolean not null default true,
  notify_upcoming_days        integer not null default 7 check (notify_upcoming_days between 0 and 60),
  notify_budget               boolean not null default true,
  notify_overdue              boolean not null default true,
  notify_low_balance          boolean not null default true,
  is_demo                     boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. categories — income & expense categories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('income','expense')),
  name       text not null check (length(name) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, type, name)
);

-- ---------------------------------------------------------------------
-- 4. accounts — where money is held
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  user_id         uuid not null references auth.users (id) on delete cascade,
  id              text not null,
  name            text not null check (length(name) between 1 and 40),
  opening_balance numeric(14,2) not null default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------
-- 5. debts — loans & money owed
-- ---------------------------------------------------------------------
create table if not exists public.debts (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null check (length(name) between 1 and 60),
  original_amount   numeric(14,2) not null check (original_amount > 0),
  interest_rate     numeric(6,3) check (interest_rate between 0 and 100),
  due_date          date,
  monthly_repayment numeric(14,2) check (monthly_repayment > 0),
  frequency         text not null check (frequency in ('once','weekly','monthly','quarterly','yearly','flexible')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------
-- 6. bills — recurring bills, subscriptions, credit cards, EMIs
-- ---------------------------------------------------------------------
create table if not exists public.bills (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null check (length(name) between 1 and 60),
  kind              text not null check (kind in ('credit_card','emi','internet','rent','subscription','insurance','other')),
  amount            numeric(14,2) not null default 0 check (amount >= 0),
  frequency         text not null check (frequency in ('once','weekly','monthly','quarterly','yearly')),
  first_due_date    date not null,
  occurrences       integer not null default 1 check (occurrences between 1 and 360),
  reminder_days     integer not null default 3 check (reminder_days between 0 and 60),
  category          text not null,
  external          boolean not null default false,
  not_started       boolean not null default false,
  notes             text,
  -- EMI / installment details (null for ordinary bills)
  emi_price         numeric(14,2) check (emi_price > 0),
  emi_down_payment  numeric(14,2) check (emi_down_payment >= 0),
  emi_interest_rate numeric(6,3)  check (emi_interest_rate between 0 and 100),
  emi_purchase_date date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------
-- 7. income_sources — recurring salary / regular income
-- ---------------------------------------------------------------------
create table if not exists public.income_sources (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  name        text not null check (length(name) between 1 and 60),
  amount      numeric(14,2) not null check (amount > 0),
  frequency   text not null check (frequency in ('once','weekly','monthly','quarterly','yearly')),
  first_date  date not null,
  occurrences integer not null default 1 check (occurrences between 1 and 360),
  category    text not null,
  account_id  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------
-- 8. savings_goals
-- ---------------------------------------------------------------------
create table if not exists public.savings_goals (
  user_id         uuid not null references auth.users (id) on delete cascade,
  id              text not null,
  name            text not null check (length(name) between 1 and 60),
  target          numeric(14,2) not null check (target > 0),
  starting_amount numeric(14,2) not null default 0 check (starting_amount >= 0),
  target_date     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------
-- 9. debt_goals — "become debt-free by" target (one per user)
-- ---------------------------------------------------------------------
create table if not exists public.debt_goals (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  title       text not null check (length(title) between 1 and 80),
  target_date date not null,
  debt_ids    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. budgets — monthly limit per category (resets each month)
-- ---------------------------------------------------------------------
create table if not exists public.budgets (
  user_id       uuid not null references auth.users (id) on delete cascade,
  category      text not null,
  monthly_limit numeric(14,2) not null default 0 check (monthly_limit >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, category)
);

-- ---------------------------------------------------------------------
-- 11. transactions — every income, expense, transfer and payment
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null,
  date          date not null,
  title         text not null check (length(title) between 1 and 120),
  amount        numeric(14,2) not null check (amount > 0),
  kind          text not null check (kind in ('income','expense','transfer','debt_payment','bill_payment','savings')),
  category      text not null,
  status        text not null check (status in ('completed','planned','cancelled')),
  reserved      boolean not null default false,
  optional      boolean not null default false,
  external      boolean not null default false,
  on_hold       boolean not null default false,
  account_id    text not null,
  to_account_id text,
  debt_id       text,
  bill_id       text,
  installment   integer,
  goal_id       text,
  income_id     text,
  notes         text,
  completed_on  date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, account_id)    references public.accounts (user_id, id),
  foreign key (user_id, to_account_id) references public.accounts (user_id, id),
  foreign key (user_id, debt_id)       references public.debts (user_id, id)          on delete set null (debt_id),
  foreign key (user_id, bill_id)       references public.bills (user_id, id)          on delete set null (bill_id),
  foreign key (user_id, goal_id)       references public.savings_goals (user_id, id)  on delete set null (goal_id),
  foreign key (user_id, income_id)     references public.income_sources (user_id, id) on delete set null (income_id)
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date);
create index if not exists transactions_user_debt_idx on public.transactions (user_id, debt_id) where debt_id is not null;
create index if not exists transactions_user_bill_idx on public.transactions (user_id, bill_id) where bill_id is not null;
create index if not exists transactions_user_goal_idx on public.transactions (user_id, goal_id) where goal_id is not null;
create index if not exists transactions_user_income_idx on public.transactions (user_id, income_id) where income_id is not null;
create index if not exists transactions_user_to_account_idx on public.transactions (user_id, to_account_id) where to_account_id is not null;
create index if not exists transactions_user_account_idx on public.transactions (user_id, account_id);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','accounts','debts','bills','income_sources','savings_goals','debt_goals','budgets','transactions']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security: each user sees and changes only their own rows
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array['user_settings','categories','accounts','debts','bills','income_sources','savings_goals','debt_goals','budgets','transactions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime: live updates across a user's devices
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['user_settings','categories','accounts','debts','bills','income_sources','savings_goals','debt_goals','budgets','transactions']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Make the new tables visible to the API immediately.
notify pgrst, 'reload schema';
