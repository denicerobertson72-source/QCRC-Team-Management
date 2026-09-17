-- V1.66: generic Advanced Training private boats are singles, and safe participant
-- reservation changes reach the existing atomic coached-training reconciliation.
create or replace function public.add_advanced_training_private_lineup_boats(
  p_lineup_board_id uuid,
  p_boat_class_id text,
  p_quantity integer
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_first_sort_order integer;
begin
  if not public.can_manage_club_data() then raise exception 'Only a coach or manager can add Advanced Training lineup boats'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 12 then raise exception 'Private boat quantity must be a whole number from 1 to 12'; end if;

  perform 1
  from public.lineup_boards lb
  join public.sessions s on s.id = lb.session_id
  where lb.id = p_lineup_board_id
    and s.session_type = 'coached_training_advanced'
    and s.is_cancelled = false
  for update of lb;
  if not found then raise exception 'This lineup is not an active Advanced Training session'; end if;

  select coalesce(min(sort_order), 0) into v_first_sort_order
  from public.lineup_boats
  where lineup_board_id = p_lineup_board_id;

  with inserted_boats as (
    insert into public.lineup_boats (lineup_board_id, boat_name, boat_class_id, fleet_boat_id, sort_order)
    select p_lineup_board_id, 'Private Boat', '1x', null, v_first_sort_order - p_quantity + batch.position
    from generate_series(1, p_quantity) as batch(position)
    returning id
  )
  insert into public.lineup_seats (lineup_boat_id, seat_number, member_id)
  select inserted_boats.id, 1, null
  from inserted_boats;
end;
$$;

create or replace function public.publish_advanced_training_held_lineup(p_lineup_board_id uuid, p_assignments jsonb)
returns table(member_id uuid, old_boat_name text, new_boat_name text, session_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_session record;
  v_boat record;
  v_reservation record;
  v_member record;
  v_reconciliations jsonb;
  v_has_reservation boolean;
begin
  if not public.can_manage_club_data() then raise exception 'Only a coach or manager can publish Advanced Training lineups'; end if;
  select s.id, s.title, s.starts_at, s.ends_at, s.session_type, s.is_cancelled
    into v_session
    from public.lineup_boards lb
    join public.sessions s on s.id = lb.session_id
    where lb.id = p_lineup_board_id
    for update of lb, s;
  if v_session.id is null or v_session.session_type <> 'coached_training_advanced' or v_session.is_cancelled then raise exception 'This lineup is not an active Advanced Training session'; end if;

  perform 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id where lb.lineup_board_id = p_lineup_board_id for update;
  update public.lineup_seats ls
    set member_id = input."memberId"
    from jsonb_to_recordset(p_assignments) as input("seatId" uuid, "memberId" uuid), public.lineup_boats lb
    where ls.id = input."seatId" and lb.id = ls.lineup_boat_id and lb.lineup_board_id = p_lineup_board_id;

  if exists (
    select 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
    where lb.lineup_board_id = p_lineup_board_id and ls.member_id is not null
    group by ls.member_id having count(*) > 1
  ) then raise exception 'A rower can only be assigned to one seat in this lineup.'; end if;
  if exists (
    select 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
    where lb.lineup_board_id = p_lineup_board_id and ls.member_id is not null
      and not exists (select 1 from public.session_signups ss where ss.session_id = v_session.id and ss.member_id = ls.member_id)
  ) then raise exception 'A lineup rower is not signed up for this Advanced Training session'; end if;

  for v_boat in
    select lb.fleet_boat_id, lb.boat_name
    from public.lineup_boats lb
    where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id is not null
  loop
    if not exists (select 1 from public.boats b where b.id = v_boat.fleet_boat_id and b.status = 'available') then raise exception '% is no longer operational', v_boat.boat_name; end if;
    if not exists (select 1 from public.training_boat_holds h where h.session_id = v_session.id and h.boat_id = v_boat.fleet_boat_id and tstzrange(h.starts_at,h.ends_at,'[)') @> tstzrange(v_session.starts_at,v_session.ends_at,'[)')) then raise exception '% is not held for this Advanced Training session', v_boat.boat_name; end if;
    if not exists (select 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id = v_boat.fleet_boat_id and ls.member_id is not null) then raise exception '% needs at least one assigned rower before publishing', v_boat.boat_name; end if;

    select r.id, r.status, r.created_by into v_reservation
    from public.reservations r
    where r.boat_id = v_boat.fleet_boat_id and r.status in ('reserved','checked_out')
      and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(v_session.starts_at,v_session.ends_at,'[)')
    for update;
    v_has_reservation := found;
    if v_has_reservation and v_reservation.status = 'checked_out' then raise exception '% is already checked out and cannot be used for Advanced Training', v_boat.boat_name; end if;
    if v_has_reservation and exists (
      select 1
      from (
        select v_reservation.created_by as member_id
        union
        select rc.member_id from public.reservation_crew rc where rc.reservation_id = v_reservation.id
      ) reservation_members
      where not exists (select 1 from public.session_signups ss where ss.session_id = v_session.id and ss.member_id = reservation_members.member_id)
    ) then raise exception '% has an existing member reservation that conflicts with this Advanced Training session. Resolve the reservation conflict before publishing.', v_boat.boat_name; end if;

    -- A single participant reservation may be released and recreated by the atomic
    -- reconciliation below. Multi-member reservations are reusable only when their
    -- distinct crew exactly matches this final boat's lineup.
    if v_has_reservation and (
      (select count(*) from (
        select v_reservation.created_by as member_id
        union
        select rc.member_id from public.reservation_crew rc where rc.reservation_id = v_reservation.id
      ) reservation_members) > 1
      and (
        exists (
          select 1 from (
            select v_reservation.created_by as member_id
            union
            select rc.member_id from public.reservation_crew rc where rc.reservation_id = v_reservation.id
          ) reservation_members
          where not exists (
            select 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
            where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id = v_boat.fleet_boat_id and ls.member_id = reservation_members.member_id
          )
        )
        or exists (
          select 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
          where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id = v_boat.fleet_boat_id and ls.member_id is not null
            and not exists (
              select 1 from (
                select v_reservation.created_by as member_id
                union
                select rc.member_id from public.reservation_crew rc where rc.reservation_id = v_reservation.id
              ) reservation_members
              where reservation_members.member_id = ls.member_id
            )
        )
      )
    ) then raise exception '% has a multi-member reservation that needs manual reconciliation before publishing.', v_boat.boat_name; end if;
  end loop;

  for v_member in
    select distinct ls.member_id, lb.boat_name, lb.fleet_boat_id, b.required_clearance, b.required_skill_level, b.weight_class, p.status, p.skill_level, p.weight_class as member_weight_class
    from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
    join public.boats b on b.id = lb.fleet_boat_id join public.profiles p on p.id = ls.member_id
    where lb.lineup_board_id = p_lineup_board_id and ls.member_id is not null and lb.fleet_boat_id is not null
  loop
    if v_member.status <> 'active' then raise exception 'A final lineup member is not active for %', v_member.boat_name; end if;
    if public.skill_level_to_clearance(v_member.skill_level) < v_member.required_clearance then raise exception 'A final lineup member does not meet the required clearance for %', v_member.boat_name; end if;
    if public.skill_level_rank(v_member.skill_level) < public.skill_level_rank(v_member.required_skill_level) then raise exception 'A final lineup member does not meet the required skill level for %', v_member.boat_name; end if;
    if v_member.weight_class is not null and public.weight_class_rank(v_member.weight_class) < public.weight_class_rank(v_member.member_weight_class) then raise exception 'A final lineup member does not meet the weight requirement for %', v_member.boat_name; end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('reconciliation_member_id', members.member_id, 'action', 'update')), '[]'::jsonb)
    into v_reconciliations
    from (
      select distinct ls.member_id
      from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
      where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id is not null and ls.member_id is not null
    ) members;
  return query select * from public.publish_coached_training_lineup(p_lineup_board_id, '[]'::jsonb, v_reconciliations);
end;
$$;
