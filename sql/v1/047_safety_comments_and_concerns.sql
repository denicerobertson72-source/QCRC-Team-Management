-- V1.47: preserve launch/return comments independently and let all active members raise safety concerns.

alter table public.reservations
  add column if not exists launch_comment text,
  add column if not exists return_comment text;

alter table public.private_boat_outings
  add column if not exists launch_comment text,
  add column if not exists return_comment text;

-- Supabase does not expose whether an existing user's password hash exists to
-- the browser. Record successful password setup so the home reminder is exact
-- for all future password changes and prompts older accounts to confirm one.
alter table public.profiles
  add column if not exists password_set_at timestamptz;

-- Keep comment writes inside the security-definer launch/return operations so
-- a crew member who is permitted to sign a boat in/out can save their comment.
create or replace function public.checkout_reservation(
  p_reservation_id uuid,
  p_location text default null,
  p_direction text default null,
  p_launch_comment text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.reservations;
begin
  if not exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id
      and (r.created_by = auth.uid() or public.is_member_in_reservation(r.id, auth.uid()) or public.can_manage_club_data())
  ) then
    raise exception 'Not authorized to check out this reservation';
  end if;

  update public.reservations r
  set status = 'checked_out',
      checked_out_at = coalesce(r.checked_out_at, now()),
      checkout_location = coalesce(p_location, r.checkout_location),
      river_direction = coalesce(p_direction, r.river_direction),
      launch_comment = coalesce(nullif(btrim(p_launch_comment), ''), r.launch_comment)
  where r.id = p_reservation_id and r.status = 'reserved'
  returning r.* into v_record;

  if v_record.id is null then raise exception 'Reservation must be in reserved status to check out'; end if;
  return v_record;
end;
$$;

create or replace function public.checkin_reservation(
  p_reservation_id uuid,
  p_notes text default null,
  p_return_comment text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.reservations;
begin
  if not exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id
      and (r.created_by = auth.uid() or public.is_member_in_reservation(r.id, auth.uid()) or public.can_manage_club_data())
  ) then
    raise exception 'Not authorized to check in this reservation';
  end if;

  update public.reservations r
  set status = 'checked_in',
      checked_in_at = coalesce(r.checked_in_at, now()),
      notes = coalesce(p_notes, r.notes),
      return_comment = coalesce(nullif(btrim(p_return_comment), ''), r.return_comment)
  where r.id = p_reservation_id and r.status = 'checked_out'
  returning r.* into v_record;

  if v_record.id is null then raise exception 'Reservation must be checked_out before check-in'; end if;
  return v_record;
end;
$$;

grant execute on function public.checkout_reservation(uuid, text, text, text) to authenticated;
grant execute on function public.checkin_reservation(uuid, text, text) to authenticated;

create table if not exists public.safety_concerns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists safety_concerns_created_at_idx
  on public.safety_concerns(created_at desc);

create table if not exists public.safety_concern_photos (
  id uuid primary key default gen_random_uuid(),
  safety_concern_id uuid not null references public.safety_concerns(id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists safety_concern_photos_concern_idx
  on public.safety_concern_photos(safety_concern_id, created_at);

alter table public.safety_concerns enable row level security;
grant select, insert on public.safety_concerns to authenticated;

drop policy if exists safety_concerns_active_member_read on public.safety_concerns;
create policy safety_concerns_active_member_read
on public.safety_concerns for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  )
);

drop policy if exists safety_concerns_active_member_insert on public.safety_concerns;
create policy safety_concerns_active_member_insert
on public.safety_concerns for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  )
);

alter table public.safety_concern_photos enable row level security;
grant select, insert on public.safety_concern_photos to authenticated;

drop policy if exists safety_concern_photos_active_member_read on public.safety_concern_photos;
create policy safety_concern_photos_active_member_read
on public.safety_concern_photos for select
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
);

drop policy if exists safety_concern_photos_active_member_insert on public.safety_concern_photos;
create policy safety_concern_photos_active_member_insert
on public.safety_concern_photos for insert
with check (
  uploaded_by = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
);

insert into storage.buckets (id, name, public)
values ('safety-concern-photos', 'safety-concern-photos', false)
on conflict (id) do nothing;

drop policy if exists "safety_concern_photos_bucket_read_authenticated" on storage.objects;
create policy "safety_concern_photos_bucket_read_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'safety-concern-photos');

drop policy if exists "safety_concern_photos_bucket_insert_own_folder" on storage.objects;
create policy "safety_concern_photos_bucket_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'safety-concern-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
