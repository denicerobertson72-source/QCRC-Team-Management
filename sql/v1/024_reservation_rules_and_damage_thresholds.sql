-- V1.24: reservation eligibility tightening and minor damage staying in rotation

create or replace function public.fn_damage_autolock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold int := 3;
begin
  if new.severity >= v_threshold then
    new.locked_boat := true;
    update public.boats
    set status = 'locked'
    where id = new.boat_id;
  else
    new.locked_boat := false;
  end if;

  return new;
end;
$$;

alter table public.reservations
  drop constraint if exists reservations_no_overlap_per_boat_v1;

alter table public.reservations
  add constraint reservations_no_overlap_per_boat_v1
  exclude using gist (
    boat_id with =,
    time_range with &&
  )
  where (status in ('reserved', 'checked_out'));

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
      and (
        p.dues_ok = true
        or (
          p.dues_renewal_date is not null
          and p.dues_renewal_date >= current_date - 7
        )
      )
      and p.waiver_signed_at is not null
  ),
  boat_cte as (
    select b.*
    from public.boats b
    where b.id = p_boat_id
      and b.status = 'available'
  ),
  eligibility_cte as (
    select
      greatest(mc.clearance_level, public.skill_level_to_clearance(p.skill_level)) as effective_clearance,
      b.required_clearance
    from profile_cte p
    join boat_cte b on true
    join public.member_clearances mc
      on mc.member_id = p.id
     and mc.boat_class_id = b.boat_class_id
  )
  select
    p_end_time > p_start_time
    and exists(select 1 from profile_cte)
    and exists(select 1 from boat_cte)
    and exists(
      select 1
      from eligibility_cte c
      where c.effective_clearance >= c.required_clearance
    )
    and exists(
      select 1
      from profile_cte p
      join boat_cte b on true
      where public.skill_level_rank(p.skill_level) >= public.skill_level_rank(b.required_skill_level)
        and (b.weight_class is null or b.weight_class = p.weight_class)
    )
    and not exists (
      select 1
      from public.boat_availability_blocks blk
      join profile_cte p on true
      join boat_cte b on true
      where blk.is_active = true
        and tstzrange(blk.starts_at, blk.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')
        and (blk.applies_to_membership_type is null or blk.applies_to_membership_type = p.membership_type)
        and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id = b.boat_class_id)
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
    select p.id, p.skill_level, p.weight_class, p.membership_type
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.dues_ok = true
        or (
          p.dues_renewal_date is not null
          and p.dues_renewal_date >= current_date - 7
        )
      )
      and p.waiver_signed_at is not null
  )
  select b.*
  from public.boats b
  join me on true
  left join public.member_clearances mc
    on mc.member_id = me.id
   and mc.boat_class_id = b.boat_class_id
  where b.status = 'available'
    and greatest(coalesce(mc.clearance_level, 0), public.skill_level_to_clearance(me.skill_level)) >= b.required_clearance
    and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level)
    and (b.weight_class is null or b.weight_class = me.weight_class)
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
    and not exists (
      select 1
      from public.boat_availability_blocks blk
      where blk.is_active = true
        and tstzrange(blk.starts_at, blk.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')
        and (blk.applies_to_membership_type is null or blk.applies_to_membership_type = me.membership_type)
        and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id = b.boat_class_id)
    )
  order by b.boat_class_id, b.required_clearance, b.name;
$$;

create or replace function public.reserve_boat(
  p_boat_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_checkout_location text default null,
  p_notes text default null,
  p_crew uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
  v_seats int;
  v_crew_count int;
begin
  if not public.can_user_reserve_boat(auth.uid(), p_boat_id, p_start_time, p_end_time) then
    raise exception 'Reservation blocked: member, dues, waiver, clearance, or boat eligibility check failed';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.created_by = auth.uid()
      and r.status in ('reserved', 'checked_out')
      and tstzrange(
        r.start_time - interval '90 minutes',
        r.end_time + interval '90 minutes',
        '[)'
      ) && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'You already have another active or reserved outing within 90 minutes of this time.';
  end if;

  select bc.seats
  into v_seats
  from public.boats b
  join public.boat_classes bc on bc.id = b.boat_class_id
  where b.id = p_boat_id;

  v_crew_count := coalesce(array_length(p_crew, 1), 0);

  if (v_crew_count + 1) > v_seats then
    raise exception 'Too many crew members for this boat class';
  end if;

  insert into public.reservations (
    boat_id,
    created_by,
    start_time,
    end_time,
    checkout_location,
    notes,
    status
  )
  values (
    p_boat_id,
    auth.uid(),
    p_start_time,
    p_end_time,
    p_checkout_location,
    p_notes,
    'reserved'
  )
  returning id into v_reservation_id;

  insert into public.reservation_crew (reservation_id, member_id, seat)
  values (v_reservation_id, auth.uid(), 'seat1')
  on conflict do nothing;

  insert into public.reservation_crew (reservation_id, member_id, seat)
  select v_reservation_id, member_id, null
  from (
    select distinct unnest(p_crew) as member_id
  ) x
  where member_id is not null
    and member_id <> auth.uid()
  on conflict do nothing;

  return v_reservation_id;
end;
$$;
