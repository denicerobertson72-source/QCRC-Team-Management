-- V1.32: allow rowers to reserve boats in their own weight class
-- or any higher weight class. Skill eligibility already works this way.

create or replace function public.weight_class_rank(p_class text)
returns integer
language sql
immutable
as $$
  select case p_class
    when 'Lightweight' then 1
    when 'Mid-weight' then 2
    when 'Heavyweight' then 3
    else 2
  end;
$$;

create or replace function public.can_user_reserve_boat(
  p_user_id uuid,
  p_boat_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with profile_cte as (
    select p.*
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
  ),
  boat_cte as (
    select b.*
    from public.boats b
    where b.id = p_boat_id
      and b.status = 'available'
  )
  select
    p_end_time > p_start_time
    and exists(select 1 from profile_cte)
    and exists(select 1 from boat_cte)
    and exists(
      select 1
      from profile_cte p
      join boat_cte b on true
      where public.skill_level_to_clearance(p.skill_level) >= b.required_clearance
        and public.skill_level_rank(p.skill_level) >= public.skill_level_rank(b.required_skill_level)
        and (
          b.weight_class is null
          or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(p.weight_class)
        )
    );
$$;

create or replace function public.available_boats_for_window(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_boat_class_id text default null
)
returns setof public.boats
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
  select b.*
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
