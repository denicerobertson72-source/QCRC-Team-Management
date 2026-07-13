-- V1.34: lightweight availability lookup for /reserve.
-- Mirrors available_boats_for_window, but returns only boat ids so the page
-- does not fetch full boat records twice.

create or replace function public.available_boat_ids_for_window(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_boat_class_id text default null
)
returns table(id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.skill_level, p.weight_class
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
  )
  select b.id
  from public.boats b
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
    and not exists (
      select 1
      from public.reservations r
      where r.boat_id = b.id
        and r.status in ('reserved', 'checked_out')
        and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    )
    and not exists (
      select 1
      from public.reservations own_r
      where own_r.created_by = auth.uid()
        and own_r.status in ('reserved', 'checked_out')
        and tstzrange(
          own_r.start_time - interval '90 minutes',
          own_r.end_time + interval '90 minutes',
          '[)'
        ) && tstzrange(p_start_time, p_end_time, '[)')
    )
  order by b.boat_class_id, b.required_clearance, b.name;
$$;

revoke all on function public.available_boat_ids_for_window(timestamptz, timestamptz, text) from public;
grant execute on function public.available_boat_ids_for_window(timestamptz, timestamptz, text) to authenticated;
