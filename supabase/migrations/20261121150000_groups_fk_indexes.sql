create index if not exists group_activity_actor_idx on public.group_activity (actor_id);
create index if not exists group_goals_created_by_idx on public.group_goals (created_by);
create index if not exists group_invitations_accepted_by_idx on public.group_invitations (accepted_by) where accepted_by is not null;
create index if not exists group_invitations_invited_by_idx on public.group_invitations (invited_by);
create index if not exists group_invitations_revoked_by_idx on public.group_invitations (revoked_by) where revoked_by is not null;
create index if not exists group_members_removed_by_idx on public.group_members (removed_by) where removed_by is not null;
create index if not exists group_tx_cancelled_by_idx on public.group_transactions (cancelled_by) where cancelled_by is not null;
create index if not exists group_tx_decided_by_idx on public.group_transactions (decided_by) where decided_by is not null;
