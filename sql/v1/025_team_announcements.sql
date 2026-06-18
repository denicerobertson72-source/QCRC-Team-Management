create table if not exists public.team_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists team_announcements_published_idx
  on public.team_announcements(is_published, starts_at, ends_at, created_at desc);

alter table public.team_announcements enable row level security;

drop policy if exists team_announcements_read on public.team_announcements;
create policy team_announcements_read
on public.team_announcements
for select
using (
  public.can_manage_club_data()
  or (
    is_published = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
);

drop policy if exists team_announcements_manage on public.team_announcements;
create policy team_announcements_manage
on public.team_announcements
for all
using (public.is_admin())
with check (public.is_admin());
