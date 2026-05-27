-- V1.21: opt-in rowing meetup member pool and availability slots

create table if not exists public.rowing_meetup_members (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  skill_level text not null default 'Beginner',
  wants_2x boolean not null default true,
  wants_4x boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rowing_meetup_availability (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.rowing_meetup_members(member_id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (member_id, weekday, start_time, end_time)
);

create index if not exists rowing_meetup_availability_member_idx
  on public.rowing_meetup_availability(member_id, weekday, start_time);

drop trigger if exists trg_rowing_meetup_members_updated_at on public.rowing_meetup_members;
create trigger trg_rowing_meetup_members_updated_at
before update on public.rowing_meetup_members
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_rowing_meetup_availability_updated_at on public.rowing_meetup_availability;
create trigger trg_rowing_meetup_availability_updated_at
before update on public.rowing_meetup_availability
for each row execute function public.fn_set_updated_at();

alter table public.rowing_meetup_members enable row level security;
alter table public.rowing_meetup_availability enable row level security;

drop policy if exists rowing_meetup_members_read on public.rowing_meetup_members;
create policy rowing_meetup_members_read
on public.rowing_meetup_members
for select
using (auth.role() = 'authenticated');

drop policy if exists rowing_meetup_members_insert on public.rowing_meetup_members;
create policy rowing_meetup_members_insert
on public.rowing_meetup_members
for insert
with check (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists rowing_meetup_members_update on public.rowing_meetup_members;
create policy rowing_meetup_members_update
on public.rowing_meetup_members
for update
using (member_id = auth.uid() or public.can_manage_club_data())
with check (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists rowing_meetup_members_delete on public.rowing_meetup_members;
create policy rowing_meetup_members_delete
on public.rowing_meetup_members
for delete
using (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists rowing_meetup_availability_read on public.rowing_meetup_availability;
create policy rowing_meetup_availability_read
on public.rowing_meetup_availability
for select
using (auth.role() = 'authenticated');

drop policy if exists rowing_meetup_availability_insert on public.rowing_meetup_availability;
create policy rowing_meetup_availability_insert
on public.rowing_meetup_availability
for insert
with check (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists rowing_meetup_availability_update on public.rowing_meetup_availability;
create policy rowing_meetup_availability_update
on public.rowing_meetup_availability
for update
using (member_id = auth.uid() or public.can_manage_club_data())
with check (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists rowing_meetup_availability_delete on public.rowing_meetup_availability;
create policy rowing_meetup_availability_delete
on public.rowing_meetup_availability
for delete
using (member_id = auth.uid() or public.can_manage_club_data());
