-- V1.38: limited, privacy-preserving availability details for the boat search.
-- Members can see that an eligible boat is in use and its expected return time,
-- but not the identity of the rower using it.

create or replace function public.unavailable_boats_for_window(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_boat_class_id text default null
)
returns table(
  boat_id uuid,
  reservation_status text,
  expected_return_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.skill_level, p.weight_class
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
  )
  select
    r.boat_id,
    r.status as reservation_status,
    r.end_time as expected_return_at
  from public.reservations r
  join public.boats b on b.id = r.boat_id
  join me on true
  where b.status = 'available'
    and public.skill_level_to_clearance(me.skill_level) >= b.required_clearance
    and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level)
    and (
      b.weight_class is null
      or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(me.weight_class)
    )
    and p_end_time > p_start_time
    and (p_boat_class_id is null or b.boat_class_id = p_boat_class_id)
    and r.status in ('reserved', 'checked_out')
    and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  order by r.end_time asc;
$$;

revoke all on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) from public;
grant execute on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) to authenticated;
