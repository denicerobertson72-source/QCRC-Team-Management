alter table public.profiles
  add column if not exists dues_renewal_date date,
  add column if not exists dues_last_paid_at timestamptz,
  add column if not exists boat_storage_fee_ok boolean not null default false,
  add column if not exists boat_storage_fee_renewal_date date,
  add column if not exists boat_storage_fee_last_paid_at timestamptz;

update public.profiles
set dues_renewal_date = coalesce(dues_renewal_date, (current_date + interval '1 year')::date)
where dues_ok = true
  and dues_renewal_date is null;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  notification_type text not null,
  member_id uuid references public.profiles(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

create index if not exists notification_events_type_idx on public.notification_events(notification_type, sent_at desc);
create index if not exists notification_events_member_idx on public.notification_events(member_id, sent_at desc);

create or replace function public.fn_guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if old.id = auth.uid() then
    if new.role <> old.role
      or new.status <> old.status
      or new.dues_ok <> old.dues_ok
      or new.dues_renewal_date is distinct from old.dues_renewal_date
      or new.dues_last_paid_at is distinct from old.dues_last_paid_at
      or new.boat_storage_fee_ok <> old.boat_storage_fee_ok
      or new.boat_storage_fee_renewal_date is distinct from old.boat_storage_fee_renewal_date
      or new.boat_storage_fee_last_paid_at is distinct from old.boat_storage_fee_last_paid_at
      or new.coach_id is distinct from old.coach_id
      or new.membership_type <> old.membership_type then
      raise exception 'Only admin can update role/status/dues/storage/coach/membership fields';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this profile';
end;
$$;

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
  order by r.checked_out_at asc;
$$;

grant execute on function public.overdue_boat_summary() to authenticated;

alter table public.notification_events enable row level security;

drop policy if exists notification_events_admin_read on public.notification_events;
create policy notification_events_admin_read
on public.notification_events
for select
using (public.is_admin());
