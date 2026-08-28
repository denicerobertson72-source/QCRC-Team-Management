-- V1.39: members may opt in to alerts when another QCRC rower launches.
create table if not exists public.launch_notification_members (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_launch_notification_members_updated_at on public.launch_notification_members;
create trigger trg_launch_notification_members_updated_at
before update on public.launch_notification_members
for each row execute function public.fn_set_updated_at();

alter table public.launch_notification_members enable row level security;

create policy launch_notification_members_read
on public.launch_notification_members for select
using (member_id = auth.uid() or public.can_manage_club_data());

create policy launch_notification_members_insert
on public.launch_notification_members for insert
with check (member_id = auth.uid() or public.can_manage_club_data());

create policy launch_notification_members_delete
on public.launch_notification_members for delete
using (member_id = auth.uid() or public.can_manage_club_data());
