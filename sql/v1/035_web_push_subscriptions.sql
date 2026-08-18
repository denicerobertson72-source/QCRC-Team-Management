-- Browser push subscriptions are tied to the signed-in member that enabled them.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_member_id_idx on public.push_subscriptions(member_id);

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.fn_set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_member_select on public.push_subscriptions;
create policy push_subscriptions_member_select
on public.push_subscriptions for select
using (member_id = auth.uid());

drop policy if exists push_subscriptions_member_insert on public.push_subscriptions;
create policy push_subscriptions_member_insert
on public.push_subscriptions for insert
with check (member_id = auth.uid());

drop policy if exists push_subscriptions_member_update on public.push_subscriptions;
create policy push_subscriptions_member_update
on public.push_subscriptions for update
using (member_id = auth.uid())
with check (member_id = auth.uid());

drop policy if exists push_subscriptions_member_delete on public.push_subscriptions;
create policy push_subscriptions_member_delete
on public.push_subscriptions for delete
using (member_id = auth.uid());
