-- Optional RPC for availability

create or replace function available_boats(
  p_section_id uuid,
  p_date date,
  p_time_slot_id uuid
) returns setof boats
language sql
stable
security definer
set search_path = public
as $$
  with member_cte as (
    select * from members where user_id = auth.uid() and active = true
  ),
  slot_cte as (
    select * from time_slots where id = p_time_slot_id and section_id = p_section_id
  ),
  blackout_cte as (
    select 1
    from blackouts b
    join slot_cte s on true
    where b.date = p_date
      and (b.section_id is null or b.section_id = p_section_id)
      and (b.start_time, b.end_time) overlaps (s.start_time, s.end_time)
    limit 1
  )
  select b.*
  from boats b
  join member_cte m on true
  join slot_cte s on true
  where b.status = 'active'
    and b.min_skill_level <= m.skill_level
    and not exists (
      select 1 from reservations r
      where r.boat_id = b.id
        and r.date = p_date
        and r.time_slot_id = p_time_slot_id
    )
    and not exists (select 1 from blackout_cte);
$$;

revoke all on function available_boats(uuid, date, uuid) from public;
grant execute on function available_boats(uuid, date, uuid) to authenticated;
