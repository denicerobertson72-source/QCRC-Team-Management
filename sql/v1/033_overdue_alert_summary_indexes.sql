-- V1.33: speed up overdue alert checks for the top nav and cron jobs

create index if not exists reservations_checked_out_alert_idx
  on public.reservations (checked_out_at asc)
  include (boat_id, created_by, checkout_location, river_direction)
  where status = 'checked_out' and checked_out_at is not null;

create index if not exists private_boat_outings_checked_out_alert_idx
  on public.private_boat_outings (checked_out_at asc)
  include (member_id, checkout_location, river_direction)
  where status = 'checked_out';

create or replace function public.overdue_boat_alert_summary()
returns table(
  overdue_count bigint,
  first_boat_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with overdue as (
    select
      r.checked_out_at,
      b.name as boat_name
    from public.reservations r
    join public.boats b on b.id = r.boat_id
    where r.status = 'checked_out'
      and r.checked_out_at is not null
      and r.checked_out_at <= now() - interval '2 hours'

    union all

    select
      pbo.checked_out_at,
      'Private Boat' as boat_name
    from public.private_boat_outings pbo
    where pbo.status = 'checked_out'
      and pbo.checked_out_at <= now() - interval '2 hours'
  ),
  first_row as (
    select overdue.boat_name
    from overdue
    order by overdue.checked_out_at asc
    limit 1
  )
  select
    count(*)::bigint as overdue_count,
    (select first_row.boat_name from first_row) as first_boat_name
  from overdue;
$$;

grant execute on function public.overdue_boat_alert_summary() to authenticated;
