-- =====================================================================
-- PocketLedger — Groups: shared savings & expenses
-- Members read through RLS; every write goes through SECURITY DEFINER
-- functions that check roles, lock the group row (serialising concurrent
-- writers) and keep the balance from ever going negative.
-- Records are never deleted: cancellations and corrections keep the original.
-- =====================================================================

-- ---------------------------------------------------------------- tables
create table if not exists public.groups (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) between 1 and 60),
  description           text check (description is null or length(description) <= 280),
  icon                  text not null default '👥' check (length(icon) <= 16),
  color                 text not null default 'blue' check (color in ('blue','green','orange','violet','teal','rose','slate')),
  currency              text not null default 'NPR' check (currency in ('NPR','USD','INR','GBP','EUR')),
  owner_id              uuid not null references auth.users (id),
  -- direct: members withdraw straight away · approval: an admin must approve · admins_only: only admins withdraw
  withdrawal_mode       text not null default 'approval' check (withdrawal_mode in ('direct','approval','admins_only')),
  contributions_need_confirmation boolean not null default false,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id     uuid not null references public.groups (id),
  user_id      uuid not null references auth.users (id),
  role         text not null check (role in ('owner','admin','member','viewer')),
  display_name text,
  email        text,
  joined_at    timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid references auth.users (id),
  primary key (group_id, user_id)
);
create unique index if not exists group_members_one_owner on public.group_members (group_id) where role = 'owner' and removed_at is null;
create index if not exists group_members_user_idx on public.group_members (user_id) where removed_at is null;

create table if not exists public.group_invitations (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id),
  email        text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role         text not null default 'member' check (role in ('admin','member','viewer')),
  token_hash   text not null unique,
  invited_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id),
  declined_at  timestamptz,
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users (id),
  last_sent_at timestamptz,
  send_count   integer not null default 0
);
create unique index if not exists group_invitations_one_open on public.group_invitations (group_id, email)
  where accepted_at is null and revoked_at is null and declined_at is null;
create index if not exists group_invitations_email_idx on public.group_invitations (email);

create table if not exists public.group_goals (
  id                     uuid primary key default gen_random_uuid(),
  group_id               uuid not null references public.groups (id),
  name                   text not null check (length(btrim(name)) between 1 and 60),
  description            text check (description is null or length(description) <= 280),
  kind                   text not null check (kind in ('one_time','recurring')),
  target_amount          numeric(14,2) check (target_amount is null or target_amount > 0),
  contribution_amount    numeric(14,2) check (contribution_amount is null or contribution_amount > 0),
  frequency              text check (frequency in ('daily','weekly','monthly','custom')),
  interval_days          integer check (interval_days between 1 and 365),
  start_date             date,
  end_date               date,
  allow_flexible_amounts boolean not null default true,
  created_by             uuid not null references auth.users (id),
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (kind = 'one_time' or (contribution_amount is not null and frequency is not null and start_date is not null)),
  check (frequency is distinct from 'custom' or interval_days is not null),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists group_goals_group_idx on public.group_goals (group_id);

create table if not exists public.group_transactions (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups (id),
  goal_id           uuid references public.group_goals (id),
  member_id         uuid not null references auth.users (id),   -- whose money / who took it
  created_by        uuid not null references auth.users (id),   -- who recorded it
  type              text not null check (type in ('contribution','withdrawal','expense')),
  amount            numeric(14,2) not null check (amount > 0 and amount <= 100000000000),
  category          text not null default 'General' check (length(category) between 1 and 40),
  description       text check (description is null or length(description) <= 280),
  occurred_on       date not null default current_date,
  period_date       date,                                       -- recurring goal period this pays for
  status            text not null check (status in ('pending','approved','rejected','cancelled')),
  receipt_path      text,
  corrects_id       uuid references public.group_transactions (id),
  client_request_id text,
  decided_by        uuid references auth.users (id),
  decided_at        timestamptz,
  decision_note     text,
  cancelled_by      uuid references auth.users (id),
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  unique (group_id, client_request_id)
);
create index if not exists group_tx_group_idx on public.group_transactions (group_id, occurred_on);
create index if not exists group_tx_goal_idx on public.group_transactions (goal_id) where goal_id is not null;
create index if not exists group_tx_member_idx on public.group_transactions (member_id);
create index if not exists group_tx_created_by_idx on public.group_transactions (created_by);
create index if not exists group_tx_corrects_idx on public.group_transactions (corrects_id) where corrects_id is not null;

create table if not exists public.group_activity (
  id             bigint generated always as identity primary key,
  group_id       uuid not null references public.groups (id),
  actor_id       uuid references auth.users (id),
  action         text not null,
  transaction_id uuid references public.group_transactions (id),
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists group_activity_group_idx on public.group_activity (group_id, created_at desc);
create index if not exists group_activity_tx_idx on public.group_activity (transaction_id) where transaction_id is not null;

-- remaining FK indexes (advisor: unindexed foreign keys)
create index if not exists groups_owner_idx on public.groups (owner_id);
create index if not exists group_invitations_group_idx on public.group_invitations (group_id);

do $$
declare t text;
begin
  foreach t in array array['groups','group_goals'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.group_role(p_group_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.group_members m
  where m.group_id = p_group_id and m.user_id = (select auth.uid()) and m.removed_at is null
$$;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid()) and m.removed_at is null)
$$;

-- Available balance from approved transactions only (pending never counts).
create or replace function public.group_balance(p_group_id uuid, p_goal_id uuid default null)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when t.type = 'contribution' then t.amount else -t.amount end), 0)
  from public.group_transactions t
  where t.group_id = p_group_id and t.status = 'approved'
    and (p_goal_id is null or t.goal_id = p_goal_id)
$$;

create or replace function public._group_log(p_group_id uuid, p_action text, p_tx uuid, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.group_activity (group_id, actor_id, action, transaction_id, details)
  values (p_group_id, (select auth.uid()), p_action, p_tx, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function public._require_role(p_group_id uuid, p_roles text[])
returns text language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
  if (select auth.uid()) is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  r := public.group_role(p_group_id);
  if r is null then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if not (r = any (p_roles)) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  return r;
end $$;

create or replace function public._me_name()
returns table (display_name text, email text) language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), u.email
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = (select auth.uid())
$$;

-- ---------------------------------------------------------------- groups
create or replace function public.create_group(
  p_name text, p_description text default null, p_icon text default '👥', p_color text default 'blue',
  p_currency text default 'NPR', p_withdrawal_mode text default 'approval', p_contributions_need_confirmation boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid; me record;
begin
  if (select auth.uid()) is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select * into me from public._me_name();
  insert into public.groups (name, description, icon, color, currency, owner_id, withdrawal_mode, contributions_need_confirmation)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), coalesce(nullif(p_icon, ''), '👥'), p_color, p_currency,
          (select auth.uid()), p_withdrawal_mode, p_contributions_need_confirmation)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role, display_name, email)
  values (gid, (select auth.uid()), 'owner', me.display_name, me.email);
  perform public._group_log(gid, 'group_created', null, jsonb_build_object('name', btrim(p_name)));
  return gid;
end $$;

create or replace function public.update_group(
  p_group_id uuid, p_name text, p_description text, p_icon text, p_color text, p_currency text,
  p_withdrawal_mode text, p_contributions_need_confirmation boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare has_tx boolean; old_currency text;
begin
  perform public._require_role(p_group_id, array['owner','admin']);
  select currency into old_currency from public.groups where id = p_group_id for update;
  select exists (select 1 from public.group_transactions where group_id = p_group_id) into has_tx;
  if has_tx and p_currency <> old_currency then raise exception 'CURRENCY_LOCKED' using errcode = '22023'; end if;
  update public.groups set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
    icon = coalesce(nullif(p_icon, ''), '👥'), color = p_color, currency = p_currency,
    withdrawal_mode = p_withdrawal_mode, contributions_need_confirmation = p_contributions_need_confirmation
  where id = p_group_id;
  perform public._group_log(p_group_id, 'group_updated', null, jsonb_build_object('name', btrim(p_name)));
end $$;

create or replace function public.archive_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_role(p_group_id, array['owner']);
  update public.groups set archived_at = now() where id = p_group_id and archived_at is null;
  perform public._group_log(p_group_id, 'group_archived', null, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- invitations
create or replace function public.create_invitation(p_group_id uuid, p_email text, p_role text default 'member')
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(p_email)); tok text; inv public.group_invitations;
begin
  perform public._require_role(p_group_id, array['owner','admin']);
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL' using errcode = '22023'; end if;
  if p_role not in ('admin','member','viewer') then raise exception 'INVALID_ROLE' using errcode = '22023'; end if;
  if exists (select 1 from public.group_members m join auth.users u on u.id = m.user_id
             where m.group_id = p_group_id and m.removed_at is null and lower(u.email) = e) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  -- Re-inviting replaces any earlier open invitation for this email.
  update public.group_invitations set revoked_at = now(), revoked_by = (select auth.uid())
  where group_id = p_group_id and email = e and accepted_at is null and revoked_at is null and declined_at is null;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.group_invitations (group_id, email, role, token_hash, invited_by)
  values (p_group_id, e, p_role, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), (select auth.uid()))
  returning * into inv;
  perform public._group_log(p_group_id, 'member_invited', null, jsonb_build_object('email', e, 'role', p_role));
  return query select inv.id, tok, inv.expires_at;
end $$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.group_invitations;
begin
  select * into inv from public.group_invitations where id = p_invitation_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform public._require_role(inv.group_id, array['owner','admin']);
  update public.group_invitations set revoked_at = now(), revoked_by = (select auth.uid())
  where id = p_invitation_id and accepted_at is null and revoked_at is null;
  perform public._group_log(inv.group_id, 'invitation_revoked', null, jsonb_build_object('email', inv.email));
end $$;

-- What an invite link points to (safe to show before sign-in; the token itself is the secret).
create or replace function public.invitation_preview(p_token text)
returns table (group_name text, group_icon text, inviter_name text, invited_email text, role text, status text)
language sql stable security definer set search_path = '' as $$
  select g.name, g.icon,
         coalesce((select m.display_name from public.group_members m where m.group_id = g.id and m.user_id = i.invited_by), 'A member'),
         regexp_replace(i.email, '^(.)[^@]*', '\1•••'),
         i.role,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.declined_at is not null then 'declined'
              when i.expires_at < now() then 'expired'
              when g.archived_at is not null then 'archived'
              else 'open' end
  from public.group_invitations i join public.groups g on g.id = i.group_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Invitations addressed to the signed-in user's (verified) email.
create or replace function public.my_invitations()
returns table (id uuid, group_id uuid, group_name text, group_icon text, inviter_name text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, g.id, g.name, g.icon,
         coalesce((select m.display_name from public.group_members m where m.group_id = g.id and m.user_id = i.invited_by), 'A member'),
         i.role, i.expires_at
  from public.group_invitations i
  join public.groups g on g.id = i.group_id
  join auth.users u on u.id = (select auth.uid())
  where i.email = lower(u.email) and u.email_confirmed_at is not null
    and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
    and i.expires_at > now() and g.archived_at is null
  order by i.created_at desc
$$;

create or replace function public._accept_invitation(inv public.group_invitations)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me record; u_email text; confirmed timestamptz;
begin
  select lower(email), email_confirmed_at into u_email, confirmed from auth.users where id = (select auth.uid());
  if inv.accepted_at is not null then raise exception 'INVITE_USED' using errcode = '22023'; end if;
  if inv.revoked_at is not null or inv.declined_at is not null then raise exception 'INVITE_REVOKED' using errcode = '22023'; end if;
  if inv.expires_at < now() then raise exception 'INVITE_EXPIRED' using errcode = '22023'; end if;
  if confirmed is null then raise exception 'EMAIL_NOT_CONFIRMED' using errcode = '42501'; end if;
  if u_email is distinct from inv.email then raise exception 'INVITE_EMAIL_MISMATCH' using errcode = '42501'; end if;
  if exists (select 1 from public.groups where id = inv.group_id and archived_at is not null) then
    raise exception 'GROUP_ARCHIVED' using errcode = '22023';
  end if;
  select * into me from public._me_name();
  insert into public.group_members (group_id, user_id, role, display_name, email)
  values (inv.group_id, (select auth.uid()), inv.role, me.display_name, me.email)
  on conflict (group_id, user_id) do update
    set role = case when public.group_members.removed_at is null then public.group_members.role else excluded.role end,
        removed_at = null, removed_by = null, joined_at = now(), display_name = excluded.display_name, email = excluded.email;
  update public.group_invitations set accepted_at = now(), accepted_by = (select auth.uid()) where id = inv.id;
  perform public._group_log(inv.group_id, 'member_joined', null, jsonb_build_object('name', me.display_name, 'role', inv.role));
  return inv.group_id;
end $$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.group_invitations;
begin
  if (select auth.uid()) is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select * into inv from public.group_invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002'; end if;
  return public._accept_invitation(inv);
end $$;

create or replace function public.accept_invitation_by_id(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.group_invitations;
begin
  if (select auth.uid()) is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select * into inv from public.group_invitations where id = p_invitation_id for update;
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002'; end if;
  return public._accept_invitation(inv);
end $$;

create or replace function public.decline_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.group_invitations; u_email text;
begin
  select lower(email) into u_email from auth.users where id = (select auth.uid());
  select * into inv from public.group_invitations where id = p_invitation_id for update;
  if not found or inv.email is distinct from u_email then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.group_invitations set declined_at = now() where id = inv.id and accepted_at is null;
  perform public._group_log(inv.group_id, 'invitation_declined', null, jsonb_build_object('email', inv.email));
end $$;

-- ---------------------------------------------------------------- members
create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare my_role text; their_role text;
begin
  my_role := public._require_role(p_group_id, array['owner','admin']);
  if p_role not in ('admin','member','viewer') then raise exception 'INVALID_ROLE' using errcode = '22023'; end if;
  select role into their_role from public.group_members where group_id = p_group_id and user_id = p_user_id and removed_at is null for update;
  if their_role is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if their_role = 'owner' then raise exception 'CANNOT_CHANGE_OWNER' using errcode = '42501'; end if;
  if my_role = 'admin' and (their_role = 'admin' or p_role = 'admin') then raise exception 'OWNER_ONLY' using errcode = '42501'; end if;
  update public.group_members set role = p_role where group_id = p_group_id and user_id = p_user_id;
  perform public._group_log(p_group_id, 'role_changed', null, jsonb_build_object('user_id', p_user_id, 'from', their_role, 'to', p_role));
end $$;

create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare my_role text; their_role text;
begin
  if p_user_id = (select auth.uid()) then
    my_role := public._require_role(p_group_id, array['admin','member','viewer']); -- owners can't leave their own group
  else
    my_role := public._require_role(p_group_id, array['owner','admin']);
  end if;
  select role into their_role from public.group_members where group_id = p_group_id and user_id = p_user_id and removed_at is null for update;
  if their_role is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if their_role = 'owner' then raise exception 'CANNOT_REMOVE_OWNER' using errcode = '42501'; end if;
  if p_user_id <> (select auth.uid()) and my_role = 'admin' and their_role = 'admin' then raise exception 'OWNER_ONLY' using errcode = '42501'; end if;
  -- Members leave, but their records stay: history is never deleted.
  update public.group_members set removed_at = now(), removed_by = (select auth.uid()) where group_id = p_group_id and user_id = p_user_id;
  perform public._group_log(p_group_id, case when p_user_id = (select auth.uid()) then 'member_left' else 'member_removed' end, null,
    jsonb_build_object('user_id', p_user_id));
end $$;

-- ---------------------------------------------------------------- goals
create or replace function public.save_group_goal(
  p_group_id uuid, p_goal_id uuid, p_name text, p_description text, p_kind text, p_target_amount numeric,
  p_contribution_amount numeric, p_frequency text, p_interval_days integer, p_start_date date, p_end_date date,
  p_allow_flexible_amounts boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  perform public._require_role(p_group_id, array['owner','admin']);
  if p_goal_id is null then
    insert into public.group_goals (group_id, name, description, kind, target_amount, contribution_amount, frequency,
      interval_days, start_date, end_date, allow_flexible_amounts, created_by)
    values (p_group_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_kind, p_target_amount,
      case when p_kind = 'recurring' then p_contribution_amount end,
      case when p_kind = 'recurring' then p_frequency end,
      case when p_kind = 'recurring' and p_frequency = 'custom' then p_interval_days end,
      case when p_kind = 'recurring' then p_start_date end,
      case when p_kind = 'recurring' then p_end_date end,
      coalesce(p_allow_flexible_amounts, true), (select auth.uid()))
    returning id into gid;
    perform public._group_log(p_group_id, 'goal_created', null, jsonb_build_object('goal_id', gid, 'name', btrim(p_name)));
  else
    update public.group_goals set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
      kind = p_kind, target_amount = p_target_amount,
      contribution_amount = case when p_kind = 'recurring' then p_contribution_amount end,
      frequency = case when p_kind = 'recurring' then p_frequency end,
      interval_days = case when p_kind = 'recurring' and p_frequency = 'custom' then p_interval_days end,
      start_date = case when p_kind = 'recurring' then p_start_date end,
      end_date = case when p_kind = 'recurring' then p_end_date end,
      allow_flexible_amounts = coalesce(p_allow_flexible_amounts, true)
    where id = p_goal_id and group_id = p_group_id
    returning id into gid;
    if gid is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    perform public._group_log(p_group_id, 'goal_updated', null, jsonb_build_object('goal_id', gid, 'name', btrim(p_name)));
  end if;
  return gid;
end $$;

create or replace function public.archive_group_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.group_goals;
begin
  select * into g from public.group_goals where id = p_goal_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform public._require_role(g.group_id, array['owner','admin']);
  update public.group_goals set archived_at = now() where id = p_goal_id and archived_at is null;
  perform public._group_log(g.group_id, 'goal_archived', null, jsonb_build_object('goal_id', g.id, 'name', g.name));
end $$;

-- ---------------------------------------------------------------- transactions
create or replace function public.add_group_transaction(
  p_group_id uuid, p_type text, p_amount numeric, p_goal_id uuid default null, p_category text default 'General',
  p_description text default null, p_occurred_on date default current_date, p_period_date date default null,
  p_receipt_path text default null, p_client_request_id text default null, p_member_id uuid default null)
returns public.group_transactions language plpgsql security definer set search_path = '' as $$
declare
  my_role text; grp public.groups; goal public.group_goals; tx public.group_transactions;
  st text; who uuid; available numeric; is_admin boolean;
begin
  my_role := public._require_role(p_group_id, array['owner','admin','member']);
  is_admin := my_role in ('owner','admin');
  if p_type not in ('contribution','withdrawal','expense') then raise exception 'INVALID_TYPE' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode = '22023'; end if;

  -- Serialise every money movement in this group (prevents overspending under concurrency).
  select * into grp from public.groups where id = p_group_id for update;
  if grp.archived_at is not null then raise exception 'GROUP_ARCHIVED' using errcode = '22023'; end if;

  -- Idempotency: the same client request never creates a second record.
  if p_client_request_id is not null then
    select * into tx from public.group_transactions where group_id = p_group_id and client_request_id = p_client_request_id;
    if found then return tx; end if;
  end if;

  if p_goal_id is not null then
    select * into goal from public.group_goals where id = p_goal_id and group_id = p_group_id;
    if not found or goal.archived_at is not null then raise exception 'GOAL_NOT_FOUND' using errcode = 'P0002'; end if;
    if p_type = 'contribution' and goal.kind = 'recurring' and not goal.allow_flexible_amounts and p_amount <> goal.contribution_amount then
      raise exception 'FIXED_AMOUNT' using errcode = '22023';
    end if;
  end if;

  -- Whose money: members record their own; admins may record for another active member.
  who := coalesce(p_member_id, (select auth.uid()));
  if who <> (select auth.uid()) then
    if not is_admin then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
    if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = who and removed_at is null) then
      raise exception 'NOT_A_MEMBER' using errcode = '42501';
    end if;
  end if;

  if p_type = 'contribution' then
    st := case when grp.contributions_need_confirmation and not is_admin then 'pending' else 'approved' end;
  elsif p_type = 'withdrawal' then
    if grp.withdrawal_mode = 'admins_only' and not is_admin then raise exception 'WITHDRAWALS_ADMIN_ONLY' using errcode = '42501'; end if;
    st := case when grp.withdrawal_mode = 'approval' and not is_admin then 'pending' else 'approved' end;
  else
    st := 'approved';
  end if;

  if st = 'approved' and p_type <> 'contribution' then
    available := public.group_balance(p_group_id);
    if p_amount > available then raise exception 'INSUFFICIENT_FUNDS:%', available using errcode = '23514'; end if;
    if p_goal_id is not null and p_amount > public.group_balance(p_group_id, p_goal_id) then
      raise exception 'INSUFFICIENT_GOAL_FUNDS:%', public.group_balance(p_group_id, p_goal_id) using errcode = '23514';
    end if;
  end if;

  insert into public.group_transactions (group_id, goal_id, member_id, created_by, type, amount, category, description,
    occurred_on, period_date, status, receipt_path, client_request_id, decided_by, decided_at)
  values (p_group_id, p_goal_id, who, (select auth.uid()), p_type, round(p_amount, 2),
    coalesce(nullif(btrim(p_category), ''), 'General'), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_occurred_on, current_date), p_period_date, st,
    case when p_receipt_path like p_group_id::text || '/%' then p_receipt_path end,
    p_client_request_id,
    case when st = 'approved' then (select auth.uid()) end, case when st = 'approved' then now() end)
  returning * into tx;

  perform public._group_log(p_group_id, p_type || case when st = 'pending' then '_requested' else '_added' end, tx.id,
    jsonb_build_object('amount', tx.amount, 'member_id', who, 'category', tx.category, 'goal_id', p_goal_id));
  return tx;
end $$;

create or replace function public.decide_group_transaction(p_transaction_id uuid, p_approve boolean, p_note text default null)
returns public.group_transactions language plpgsql security definer set search_path = '' as $$
declare tx public.group_transactions; available numeric;
begin
  select * into tx from public.group_transactions where id = p_transaction_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform public._require_role(tx.group_id, array['owner','admin']);
  perform 1 from public.groups where id = tx.group_id for update;
  select * into tx from public.group_transactions where id = p_transaction_id for update;
  if tx.status <> 'pending' then raise exception 'NOT_PENDING' using errcode = '22023'; end if;
  if p_approve and tx.type <> 'contribution' then
    available := public.group_balance(tx.group_id);
    if tx.amount > available then raise exception 'INSUFFICIENT_FUNDS:%', available using errcode = '23514'; end if;
  end if;
  update public.group_transactions set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = (select auth.uid()), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = tx.id returning * into tx;
  perform public._group_log(tx.group_id, case when p_approve then 'transaction_approved' else 'transaction_rejected' end, tx.id,
    jsonb_build_object('amount', tx.amount, 'type', tx.type, 'note', p_note));
  return tx;
end $$;

-- Cancel keeps the record (status = cancelled) and never lets the balance go negative.
create or replace function public.cancel_group_transaction(p_transaction_id uuid, p_reason text)
returns public.group_transactions language plpgsql security definer set search_path = '' as $$
declare tx public.group_transactions; my_role text; available numeric;
begin
  select * into tx from public.group_transactions where id = p_transaction_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  my_role := public._require_role(tx.group_id, array['owner','admin','member']);
  if my_role = 'member' and tx.created_by <> (select auth.uid()) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  perform 1 from public.groups where id = tx.group_id for update;
  select * into tx from public.group_transactions where id = p_transaction_id for update;
  if tx.status not in ('pending','approved') then raise exception 'ALREADY_CLOSED' using errcode = '22023'; end if;
  if tx.status = 'approved' and tx.type = 'contribution' then
    available := public.group_balance(tx.group_id);
    if tx.amount > available then raise exception 'WOULD_GO_NEGATIVE:%', available using errcode = '23514'; end if;
  end if;
  update public.group_transactions set status = 'cancelled', cancelled_by = (select auth.uid()), cancelled_at = now(),
    cancel_reason = btrim(p_reason)
  where id = tx.id returning * into tx;
  perform public._group_log(tx.group_id, 'transaction_cancelled', tx.id, jsonb_build_object('amount', tx.amount, 'type', tx.type, 'reason', btrim(p_reason)));
  return tx;
end $$;

-- Correction = cancel the original + add a replacement linked to it, atomically.
create or replace function public.correct_group_transaction(
  p_transaction_id uuid, p_amount numeric, p_category text, p_description text, p_occurred_on date, p_reason text)
returns public.group_transactions language plpgsql security definer set search_path = '' as $$
declare old public.group_transactions; my_role text; new_tx public.group_transactions; available numeric; delta numeric;
begin
  select * into old from public.group_transactions where id = p_transaction_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  my_role := public._require_role(old.group_id, array['owner','admin','member']);
  if my_role = 'member' and old.created_by <> (select auth.uid()) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode = '22023'; end if;
  perform 1 from public.groups where id = old.group_id for update;
  select * into old from public.group_transactions where id = p_transaction_id for update;
  if old.status <> 'approved' and old.status <> 'pending' then raise exception 'ALREADY_CLOSED' using errcode = '22023'; end if;
  if old.status = 'approved' then
    -- balance after swapping old for new must stay ≥ 0
    delta := case when old.type = 'contribution' then p_amount - old.amount else old.amount - p_amount end;
    available := public.group_balance(old.group_id);
    if available + delta < 0 then raise exception 'INSUFFICIENT_FUNDS:%', available using errcode = '23514'; end if;
  end if;
  update public.group_transactions set status = 'cancelled', cancelled_by = (select auth.uid()), cancelled_at = now(),
    cancel_reason = 'Corrected: ' || coalesce(nullif(btrim(p_reason), ''), 'updated details')
  where id = old.id;
  insert into public.group_transactions (group_id, goal_id, member_id, created_by, type, amount, category, description,
    occurred_on, period_date, status, receipt_path, corrects_id, decided_by, decided_at)
  values (old.group_id, old.goal_id, old.member_id, (select auth.uid()), old.type, round(p_amount, 2),
    coalesce(nullif(btrim(p_category), ''), old.category), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_occurred_on, old.occurred_on), old.period_date, old.status, old.receipt_path, old.id,
    case when old.status = 'approved' then (select auth.uid()) end, case when old.status = 'approved' then now() end)
  returning * into new_tx;
  perform public._group_log(old.group_id, 'transaction_corrected', new_tx.id,
    jsonb_build_object('from_amount', old.amount, 'to_amount', new_tx.amount, 'original_id', old.id, 'reason', p_reason));
  return new_tx;
end $$;

-- ---------------------------------------------------------------- RLS (read-only for members; writes via functions)
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_goals enable row level security;
alter table public.group_transactions enable row level security;
alter table public.group_activity enable row level security;

drop policy if exists "members read group" on public.groups;
create policy "members read group" on public.groups for select to authenticated using (public.is_group_member(id));
drop policy if exists "members read members" on public.group_members;
create policy "members read members" on public.group_members for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "admins read invitations" on public.group_invitations;
create policy "admins read invitations" on public.group_invitations for select to authenticated
  using (public.group_role(group_id) in ('owner','admin'));
drop policy if exists "members read goals" on public.group_goals;
create policy "members read goals" on public.group_goals for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "members read transactions" on public.group_transactions;
create policy "members read transactions" on public.group_transactions for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "members read activity" on public.group_activity;
create policy "members read activity" on public.group_activity for select to authenticated using (public.is_group_member(group_id));

revoke insert, update, delete, truncate on public.groups, public.group_members, public.group_invitations,
  public.group_goals, public.group_transactions, public.group_activity from anon, authenticated;

-- ---------------------------------------------------------------- function privileges
do $$
declare f text;
begin
  foreach f in array array[
    'public.group_role(uuid)', 'public.is_group_member(uuid)', 'public.group_balance(uuid, uuid)',
    'public._group_log(uuid, text, uuid, jsonb)', 'public._require_role(uuid, text[])', 'public._me_name()',
    'public._accept_invitation(public.group_invitations)',
    'public.create_group(text, text, text, text, text, text, boolean)',
    'public.update_group(uuid, text, text, text, text, text, text, boolean)', 'public.archive_group(uuid)',
    'public.create_invitation(uuid, text, text)', 'public.revoke_invitation(uuid)', 'public.invitation_preview(text)',
    'public.my_invitations()', 'public.accept_invitation(text)', 'public.accept_invitation_by_id(uuid)',
    'public.decline_invitation(uuid)', 'public.set_member_role(uuid, uuid, text)', 'public.remove_member(uuid, uuid)',
    'public.save_group_goal(uuid, uuid, text, text, text, numeric, numeric, text, integer, date, date, boolean)',
    'public.archive_group_goal(uuid)',
    'public.add_group_transaction(uuid, text, numeric, uuid, text, text, date, date, text, text, uuid)',
    'public.decide_group_transaction(uuid, boolean, text)', 'public.cancel_group_transaction(uuid, text)',
    'public.correct_group_transaction(uuid, numeric, text, text, date, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  -- internal helpers: not callable from the API at all
  foreach f in array array['public._group_log(uuid, text, uuid, jsonb)', 'public._require_role(uuid, text[])',
                           'public.group_balance(uuid, uuid)',
                           'public._me_name()', 'public._accept_invitation(public.group_invitations)']
  loop
    execute format('revoke execute on function %s from authenticated', f);
  end loop;
end $$;
-- Anyone holding an invite link may see what it's for (before signing in).
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------- receipts storage (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-receipts', 'group-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group members read receipts" on storage.objects;
create policy "group members read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'group-receipts' and exists (
    select 1 from public.group_members m
    where m.group_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.removed_at is null));
drop policy if exists "group writers upload receipts" on storage.objects;
create policy "group writers upload receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-receipts' and exists (
    select 1 from public.group_members m
    where m.group_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())
      and m.removed_at is null and m.role in ('owner','admin','member')));

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array['groups','group_members','group_goals','group_transactions','group_activity'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
