-- V1.22: live GPS tracking for active rowing outings

create table if not exists public.rowing_location_points (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists rowing_location_points_reservation_recorded_idx
  on public.rowing_location_points(reservation_id, recorded_at desc);

create index if not exists rowing_location_points_member_recorded_idx
  on public.rowing_location_points(member_id, recorded_at desc);

alter table public.rowing_location_points enable row level security;

drop policy if exists rowing_location_points_select on public.rowing_location_points;
create policy rowing_location_points_select
on public.rowing_location_points
for select
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists rowing_location_points_insert on public.rowing_location_points;
create policy rowing_location_points_insert
on public.rowing_location_points
for insert
with check (
  member_id = auth.uid()
  and exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and r.created_by = auth.uid()
      and r.status = 'checked_out'
  )
);
