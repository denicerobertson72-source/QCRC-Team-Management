-- Short-lived, member-created calls for finding a rowing partner or crew.
create table if not exists public.rowing_meetup_calls (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  launch_location text,
  boat_class_id text not null default 'any' check (boat_class_id in ('any', '1x', '2x', '4x')),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists rowing_meetup_calls_active_idx
  on public.rowing_meetup_calls(status, ends_at, starts_at);

create table if not exists public.rowing_meetup_call_interests (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.rowing_meetup_calls(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_id, member_id),
  check (comment is null or char_length(trim(comment)) <= 300)
);

create index if not exists rowing_meetup_call_interests_call_idx
  on public.rowing_meetup_call_interests(call_id, created_at);

drop trigger if exists trg_rowing_meetup_calls_updated_at on public.rowing_meetup_calls;
create trigger trg_rowing_meetup_calls_updated_at
before update on public.rowing_meetup_calls
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_rowing_meetup_call_interests_updated_at on public.rowing_meetup_call_interests;
create trigger trg_rowing_meetup_call_interests_updated_at
before update on public.rowing_meetup_call_interests
for each row execute function public.fn_set_updated_at();

alter table public.rowing_meetup_calls enable row level security;
alter table public.rowing_meetup_call_interests enable row level security;

create policy rowing_meetup_calls_member_read
on public.rowing_meetup_calls for select
using (public.can_manage_club_data() or exists (select 1 from public.rowing_meetup_members rm where rm.member_id = auth.uid()));

create policy rowing_meetup_calls_member_insert
on public.rowing_meetup_calls for insert
with check (
  created_by = auth.uid()
  and exists (select 1 from public.rowing_meetup_members rm where rm.member_id = auth.uid())
);

create policy rowing_meetup_calls_owner_update
on public.rowing_meetup_calls for update
using (created_by = auth.uid() or public.can_manage_club_data())
with check (created_by = auth.uid() or public.can_manage_club_data());

create policy rowing_meetup_calls_owner_delete
on public.rowing_meetup_calls for delete
using (created_by = auth.uid() or public.can_manage_club_data());

create policy rowing_meetup_call_interests_member_read
on public.rowing_meetup_call_interests for select
using (public.can_manage_club_data() or exists (select 1 from public.rowing_meetup_members rm where rm.member_id = auth.uid()));

create policy rowing_meetup_call_interests_member_insert
on public.rowing_meetup_call_interests for insert
with check (
  member_id = auth.uid()
  and exists (select 1 from public.rowing_meetup_members rm where rm.member_id = auth.uid())
);

create policy rowing_meetup_call_interests_owner_update
on public.rowing_meetup_call_interests for update
using (member_id = auth.uid() or public.can_manage_club_data())
with check (member_id = auth.uid() or public.can_manage_club_data());

create policy rowing_meetup_call_interests_owner_delete
on public.rowing_meetup_call_interests for delete
using (member_id = auth.uid() or public.can_manage_club_data());
