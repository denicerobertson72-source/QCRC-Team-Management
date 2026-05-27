-- Rowing Club V1 RPC functions (Supabase)

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
      and p.dues_ok = true
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
        and r.status not in ('cancelled', 'no_show')
        and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
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
    raise exception 'Reservation blocked: member/clearance/boat eligibility check failed';
  end if;

  select bc.seats
  into v_seats
  from public.boats b
  join public.boat_classes bc on bc.id = b.boat_class_id
  where b.id = p_boat_id;

  v_crew_count := coalesce(array_length(p_crew, 1), 0);

  -- Creator is always in the outing crew list for audit consistency.
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

create or replace function public.checkout_reservation(
  p_reservation_id uuid,
  p_location text default null
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
    select 1
    from public.reservations r
    where r.id = p_reservation_id
      and (
        r.created_by = auth.uid()
        or public.is_member_in_reservation(r.id, auth.uid())
        or public.can_manage_club_data()
      )
  ) then
    raise exception 'Not authorized to check out this reservation';
  end if;

  update public.reservations r
  set
    status = 'checked_out',
    checked_out_at = coalesce(r.checked_out_at, now()),
    checkout_location = coalesce(p_location, r.checkout_location)
  where r.id = p_reservation_id
    and r.status = 'reserved'
  returning r.* into v_record;

  if v_record.id is null then
    raise exception 'Reservation must be in reserved status to check out';
  end if;

  return v_record;
end;
$$;

create or replace function public.checkin_reservation(
  p_reservation_id uuid,
  p_notes text default null
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
    select 1
    from public.reservations r
    where r.id = p_reservation_id
      and (
        r.created_by = auth.uid()
        or public.is_member_in_reservation(r.id, auth.uid())
        or public.can_manage_club_data()
      )
  ) then
    raise exception 'Not authorized to check in this reservation';
  end if;

  update public.reservations r
  set
    status = 'checked_in',
    checked_in_at = coalesce(r.checked_in_at, now()),
    notes = coalesce(p_notes, r.notes)
  where r.id = p_reservation_id
    and r.status = 'checked_out'
  returning r.* into v_record;

  if v_record.id is null then
    raise exception 'Reservation must be checked_out before check-in';
  end if;

  return v_record;
end;
$$;

create or replace function public.submit_damage_report(
  p_reservation_id uuid,
  p_boat_id uuid,
  p_severity int,
  p_description text,
  p_photo_paths text[],
  p_responsible_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_damage_id uuid;
begin
  if p_severity < 1 or p_severity > 5 then
    raise exception 'Severity must be 1..5';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'Description is required';
  end if;

  if coalesce(array_length(p_photo_paths, 1), 0) = 0 then
    raise exception 'At least one damage photo path is required';
  end if;

  if p_reservation_id is not null then
    if not exists (
      select 1
      from public.reservations r
      where r.id = p_reservation_id
        and r.boat_id = p_boat_id
        and (
          public.is_member_in_reservation(r.id, auth.uid())
          or public.can_manage_club_data()
        )
    ) then
      raise exception 'Reservation/boat mismatch or user not in outing';
    end if;
  end if;

  insert into public.damage_reports (
    reservation_id,
    boat_id,
    reported_by,
    responsible_member_id,
    severity,
    description
  )
  values (
    p_reservation_id,
    p_boat_id,
    auth.uid(),
    p_responsible_member_id,
    p_severity,
    p_description
  )
  returning id into v_damage_id;

  insert into public.damage_photos (damage_report_id, storage_path, uploaded_by)
  select v_damage_id, p, auth.uid()
  from unnest(p_photo_paths) as p
  where p is not null and btrim(p) <> '';

  return v_damage_id;
end;
$$;

create or replace function public.triage_damage_report(
  p_damage_report_id uuid,
  p_status public.damage_status_v1,
  p_resolution_notes text default null,
  p_unlock_boat boolean default false,
  p_labor_cost numeric(10,2) default null,
  p_parts_cost numeric(10,2) default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boat_id uuid;
begin
  if not (public.is_admin() or public.is_equipment_manager()) then
    raise exception 'Only equipment manager/admin can triage damage';
  end if;

  update public.damage_reports dr
  set
    status = p_status,
    triaged_by = coalesce(dr.triaged_by, auth.uid()),
    triaged_at = coalesce(dr.triaged_at, now()),
    resolution_notes = coalesce(p_resolution_notes, dr.resolution_notes),
    resolved_at = case when p_status = 'resolved' then coalesce(dr.resolved_at, now()) else dr.resolved_at end
  where dr.id = p_damage_report_id
  returning dr.boat_id into v_boat_id;

  if v_boat_id is null then
    raise exception 'Damage report not found';
  end if;

  if p_status = 'resolved' and p_unlock_boat then
    update public.boats set status = 'available' where id = v_boat_id;
  end if;

  if p_status in ('in_repair', 'resolved') and (p_labor_cost is not null or p_parts_cost is not null) then
    insert into public.maintenance_logs (
      boat_id,
      logged_by,
      description,
      labor_cost,
      parts_cost,
      resolved_at
    )
    values (
      v_boat_id,
      auth.uid(),
      coalesce(p_resolution_notes, 'Damage triage update'),
      coalesce(p_labor_cost, 0),
      coalesce(p_parts_cost, 0),
      case when p_status = 'resolved' then now() else null end
    );
  end if;

  return p_damage_report_id;
end;
$$;

-- Restrict + grant execution
revoke all on function public.available_boats_for_window(timestamptz, timestamptz, text) from public;
revoke all on function public.reserve_boat(uuid, timestamptz, timestamptz, text, text, uuid[]) from public;
revoke all on function public.checkout_reservation(uuid, text) from public;
revoke all on function public.checkin_reservation(uuid, text) from public;
revoke all on function public.submit_damage_report(uuid, uuid, int, text, text[], uuid) from public;
revoke all on function public.triage_damage_report(uuid, public.damage_status_v1, text, boolean, numeric, numeric) from public;

grant execute on function public.available_boats_for_window(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.reserve_boat(uuid, timestamptz, timestamptz, text, text, uuid[]) to authenticated;
grant execute on function public.checkout_reservation(uuid, text) to authenticated;
grant execute on function public.checkin_reservation(uuid, text) to authenticated;
grant execute on function public.submit_damage_report(uuid, uuid, int, text, text[], uuid) to authenticated;
grant execute on function public.triage_damage_report(uuid, public.damage_status_v1, text, boolean, numeric, numeric) to authenticated;
