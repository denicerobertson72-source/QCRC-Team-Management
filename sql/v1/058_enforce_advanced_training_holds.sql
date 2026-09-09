-- V1.58: enforce active Advanced Training boat holds for ordinary member reservations.
create or replace function public.available_boat_ids_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns table(id uuid) language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.skill_level, p.weight_class, p.membership_type from public.profiles p where p.id = auth.uid() and p.status = 'active')
  select b.id from public.boats b join me on true where b.status = 'available' and public.skill_level_to_clearance(me.skill_level) >= b.required_clearance and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(me.weight_class)) and p_end_time > p_start_time and (p_boat_class_id is null or b.boat_class_id = p_boat_class_id) and not public.boat_in_program_lineup_window(b.id,p_start_time,p_end_time) and not exists (select 1 from public.reservations r where r.boat_id=b.id and r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')) and not exists (select 1 from public.boat_availability_blocks blk where blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=me.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=b.boat_class_id)) and not exists (select 1 from public.training_boat_holds h join public.sessions s on s.id = h.session_id where h.boat_id = b.id and s.session_type = 'coached_training_advanced' and s.is_cancelled = false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)'));
$$;

create or replace function public.can_user_reserve_boat(p_user_id uuid, p_boat_id uuid, p_start_time timestamptz, p_end_time timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_end_time > p_start_time and not public.boat_in_program_lineup_window(p_boat_id,p_start_time,p_end_time) and exists (select 1 from public.profiles p join public.boats b on b.id=p_boat_id where p.id=p_user_id and p.status='active' and b.status='available' and public.skill_level_to_clearance(p.skill_level)>=b.required_clearance and public.skill_level_rank(p.skill_level)>=public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class)>=public.weight_class_rank(p.weight_class)) and not exists (select 1 from public.boat_availability_blocks blk where blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=p.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=b.boat_class_id)) and not exists (select 1 from public.training_boat_holds h join public.sessions s on s.id = h.session_id where h.boat_id = b.id and s.session_type = 'coached_training_advanced' and s.is_cancelled = false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)')));
$$;

create or replace function public.reserve_boat(p_boat_id uuid, p_start_time timestamptz, p_end_time timestamptz, p_checkout_location text default null, p_notes text default null, p_crew uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_reservation_id uuid; v_seats int; v_crew_count int;
begin
  if exists (select 1 from public.training_boat_holds h join public.sessions s on s.id = h.session_id where h.boat_id = p_boat_id and s.session_type = 'coached_training_advanced' and s.is_cancelled = false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)')) then raise exception 'Boat is held for Advanced Training during this time.'; end if;
  if not public.can_user_reserve_boat(auth.uid(), p_boat_id, p_start_time, p_end_time) then raise exception 'Reservation blocked: member, dues, waiver, clearance, or boat eligibility check failed'; end if;
  if exists (select 1 from public.reservations r where r.created_by = auth.uid() and r.status in ('reserved','checked_out') and tstzrange(r.start_time - interval '90 minutes',r.end_time + interval '90 minutes','[)') && tstzrange(p_start_time,p_end_time,'[)')) then raise exception 'You already have another active or reserved outing within 90 minutes of this time.'; end if;
  select bc.seats into v_seats from public.boats b join public.boat_classes bc on bc.id = b.boat_class_id where b.id = p_boat_id;
  v_crew_count := coalesce(array_length(p_crew, 1), 0);
  if (v_crew_count + 1) > v_seats then raise exception 'Too many crew members for this boat class'; end if;
  insert into public.reservations (boat_id, created_by, start_time, end_time, checkout_location, notes, status) values (p_boat_id, auth.uid(), p_start_time, p_end_time, p_checkout_location, p_notes, 'reserved') returning id into v_reservation_id;
  insert into public.reservation_crew (reservation_id, member_id, seat) values (v_reservation_id, auth.uid(), 'seat1') on conflict do nothing;
  insert into public.reservation_crew (reservation_id, member_id, seat) select v_reservation_id, member_id, null from (select distinct unnest(p_crew) as member_id) x where member_id is not null and member_id <> auth.uid() on conflict do nothing;
  return v_reservation_id;
end;
$$;

drop function if exists public.unavailable_boats_for_window(timestamptz, timestamptz, text);
create or replace function public.unavailable_boats_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns table(boat_id uuid, reservation_status text, expected_return_at timestamptz, availability_title text)
language sql stable security definer set search_path = public as $$
  with me as (select p.skill_level, p.weight_class, p.membership_type from public.profiles p where p.id = auth.uid() and p.status = 'active'), eligible_boats as (select b.id, b.boat_class_id from public.boats b join me on true where b.status='available' and public.skill_level_to_clearance(me.skill_level)>=b.required_clearance and public.skill_level_rank(me.skill_level)>=public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class)>=public.weight_class_rank(me.weight_class)) and (p_boat_class_id is null or b.boat_class_id=p_boat_class_id)), reasons as (
    select r.boat_id, r.status::text as reservation_status, r.end_time as expected_return_at, null::text as availability_title, case when r.status = 'checked_out' then 1 else 2 end as priority from public.reservations r join eligible_boats b on b.id=r.boat_id where r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')
    union all
    select b.id, 'availability_block'::text, null::timestamptz, blk.title, 3 from eligible_boats b join me on true join public.boat_availability_blocks blk on blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=me.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=b.boat_class_id)
    union all
    select b.id, 'training_hold'::text, h.ends_at, coalesce(s.title, 'Advanced Training'), 4 from eligible_boats b join public.training_boat_holds h on h.boat_id = b.id join public.sessions s on s.id = h.session_id where s.session_type = 'coached_training_advanced' and s.is_cancelled = false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)')
  ) select distinct on (boat_id) boat_id, reservation_status, expected_return_at, availability_title from reasons order by boat_id, priority;
$$;
revoke all on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) from public;
grant execute on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) to authenticated;
