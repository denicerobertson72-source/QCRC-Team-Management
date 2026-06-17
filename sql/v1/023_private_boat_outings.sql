-- V1.23: allow private boat owners to launch without a reservation while keeping safety tracking

create table if not exists public.private_boat_outings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete restrict,
  status public.reservation_status_v1 not null default 'checked_out',
  checked_out_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checkout_location text,
  river_direction text,
  gate_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_boat_outings_member_idx on public.private_boat_outings(member_id);
create index if not exists private_boat_outings_status_idx on public.private_boat_outings(status);
create index if not exists private_boat_outings_checkout_idx on public.private_boat_outings(checked_out_at desc);

alter table public.private_boat_outings enable row level security;

drop policy if exists private_boat_outings_select on public.private_boat_outings;
create policy private_boat_outings_select
on public.private_boat_outings
for select
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists private_boat_outings_insert on public.private_boat_outings;
create policy private_boat_outings_insert
on public.private_boat_outings
for insert
with check (
  member_id = auth.uid()
  and status = 'checked_out'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.owns_private_boat = true
      and p.boat_storage_fee_ok = true
  )
  and not exists (
    select 1
    from public.private_boat_outings existing
    where existing.member_id = auth.uid()
      and existing.status = 'checked_out'
  )
);

drop policy if exists private_boat_outings_update on public.private_boat_outings;
create policy private_boat_outings_update
on public.private_boat_outings
for update
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
)
with check (
  member_id = auth.uid()
  or public.can_manage_club_data()
);

alter table public.rowing_location_points
  add column if not exists private_outing_id uuid references public.private_boat_outings(id) on delete cascade;

alter table public.rowing_location_points
  alter column reservation_id drop not null;

drop index if exists rowing_location_points_reservation_recorded_idx;
create index if not exists rowing_location_points_reservation_recorded_idx
  on public.rowing_location_points(reservation_id, recorded_at desc)
  where reservation_id is not null;

create index if not exists rowing_location_points_private_outing_recorded_idx
  on public.rowing_location_points(private_outing_id, recorded_at desc)
  where private_outing_id is not null;

alter table public.rowing_location_points
  drop constraint if exists rowing_location_points_single_outing_check;

alter table public.rowing_location_points
  add constraint rowing_location_points_single_outing_check
  check (
    (reservation_id is not null and private_outing_id is null)
    or (reservation_id is null and private_outing_id is not null)
  );

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
  and (
    exists (
      select 1
      from public.reservations r
      where r.id = reservation_id
        and r.created_by = auth.uid()
        and r.status = 'checked_out'
    )
    or exists (
      select 1
      from public.private_boat_outings pbo
      where pbo.id = private_outing_id
        and pbo.member_id = auth.uid()
        and pbo.status = 'checked_out'
    )
  )
);

create or replace function public.overdue_boat_summary()
returns table(
  reservation_id uuid,
  boat_name text,
  rower_name text,
  checked_out_at timestamptz,
  checkout_location text,
  river_direction text
)
language sql
security definer
set search_path = public
as $$
  select
    r.id as reservation_id,
    b.name as boat_name,
    p.full_name as rower_name,
    r.checked_out_at,
    r.checkout_location,
    r.river_direction
  from public.reservations r
  join public.boats b on b.id = r.boat_id
  join public.profiles p on p.id = r.created_by
  where r.status = 'checked_out'
    and r.checked_out_at is not null
    and r.checked_out_at <= now() - interval '2 hours'

  union all

  select
    pbo.id as reservation_id,
    'Private Boat' as boat_name,
    p.full_name as rower_name,
    pbo.checked_out_at,
    pbo.checkout_location,
    pbo.river_direction
  from public.private_boat_outings pbo
  join public.profiles p on p.id = pbo.member_id
  where pbo.status = 'checked_out'
    and pbo.checked_out_at <= now() - interval '2 hours'

  order by checked_out_at asc;
$$;

grant execute on function public.overdue_boat_summary() to authenticated;
