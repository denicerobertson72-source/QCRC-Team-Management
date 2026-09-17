-- V1.67: publishing a reconciled coached-training lineup is idempotent when the
-- logical member/session notification was already created by an earlier attempt.
create or replace function public.publish_coached_training_lineup(p_lineup_board_id uuid, p_assignments jsonb, p_reconciliations jsonb default '[]'::jsonb)
returns table(member_id uuid, old_boat_name text, new_boat_name text, session_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_session record; v_assignment record; v_boat record; v_old record; v_target_reservation_id uuid;
  v_changes jsonb := '{}'::jsonb; v_crew_count integer; v_seat_count integer; v_member_id uuid;
begin
  if not public.can_manage_club_data() then raise exception 'Only a coach or manager can publish coached-training lineups'; end if;
  select s.id, s.title, s.starts_at, s.ends_at, s.session_type into v_session from public.lineup_boards lb join public.sessions s on s.id = lb.session_id where lb.id = p_lineup_board_id for update of lb, s;
  if v_session.id is null or v_session.session_type not in ('coached_training_beginner_intermediate', 'coached_training_advanced') then raise exception 'This publication workflow is only available for coached-training lineups'; end if;
  perform 1 from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id where lb.lineup_board_id = p_lineup_board_id for update;
  update public.lineup_seats ls set member_id = input."memberId" from jsonb_to_recordset(p_assignments) as input("seatId" uuid, "memberId" uuid) join public.lineup_boats lb on true where ls.id = input."seatId" and lb.id = ls.lineup_boat_id and lb.lineup_board_id = p_lineup_board_id;

  -- Phase 1: validate every missing member/boat pairing and release every safe obsolete reservation.
  for v_assignment in
    select distinct ls.member_id as assigned_member_id, lb.fleet_boat_id, lb.boat_name
    from public.lineup_seats ls join public.lineup_boats lb on lb.id = ls.lineup_boat_id
    where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id is not null and ls.member_id is not null
  loop
    if not exists (select 1 from public.boats b where b.id = v_assignment.fleet_boat_id and b.status = 'available') then raise exception '% is no longer available', v_assignment.boat_name; end if;
    if exists (select 1 from public.profiles p join public.boats b on b.id = v_assignment.fleet_boat_id where p.id = v_assignment.assigned_member_id and (p.status <> 'active' or public.skill_level_to_clearance(p.skill_level) < b.required_clearance or public.skill_level_rank(p.skill_level) < public.skill_level_rank(b.required_skill_level) or (b.weight_class is not null and public.weight_class_rank(b.weight_class) < public.weight_class_rank(p.weight_class)))) then raise exception 'A final lineup member is not eligible for %', v_assignment.boat_name; end if;
    if exists (select 1 from public.reservations r join public.reservation_crew rc on rc.reservation_id = r.id where r.boat_id = v_assignment.fleet_boat_id and r.status = 'reserved' and rc.member_id = v_assignment.assigned_member_id and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(v_session.starts_at, v_session.ends_at, '[)')) then continue; end if;
    if not exists (select 1 from jsonb_to_recordset(p_reconciliations) as choice(reconciliation_member_id uuid, action text) where choice.reconciliation_member_id = v_assignment.assigned_member_id and choice.action = 'update') then raise exception 'Reservation reconciliation is required before publishing this lineup'; end if;
    select r.id, old_boat.name as boat_name into v_old from public.reservation_crew rc join public.reservations r on r.id = rc.reservation_id join public.boats old_boat on old_boat.id = r.boat_id where rc.member_id = v_assignment.assigned_member_id and r.status = 'reserved' and r.boat_id <> v_assignment.fleet_boat_id and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(v_session.starts_at, v_session.ends_at, '[)') for update of r;
    if v_old.id is not null then
      select count(*) into v_crew_count from public.reservation_crew rc where rc.reservation_id = v_old.id;
      if v_crew_count > 1 then raise exception 'A crew reservation for % needs manual reconciliation before publishing', v_old.boat_name; end if;
      update public.reservations r set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = 'Updated to match published coached-training lineup' where r.id = v_old.id;
    end if;
    v_changes := jsonb_set(v_changes, array[v_assignment.assigned_member_id::text], to_jsonb(coalesce(v_old.boat_name, 'No previous club boat')), true);
  end loop;

  -- Phase 2: after all releases, create or extend each final boat-level crew reservation.
  for v_boat in
    select lb.fleet_boat_id, lb.boat_name, array_agg(distinct ls.member_id) filter (where ls.member_id is not null) as member_ids
    from public.lineup_boats lb left join public.lineup_seats ls on ls.lineup_boat_id = lb.id
    where lb.lineup_board_id = p_lineup_board_id and lb.fleet_boat_id is not null group by lb.fleet_boat_id, lb.boat_name
  loop
    if coalesce(array_length(v_boat.member_ids, 1), 0) = 0 then continue; end if;
    v_target_reservation_id := null;
    select r.id into v_target_reservation_id from public.reservations r where r.boat_id = v_boat.fleet_boat_id and r.status = 'reserved' and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(v_session.starts_at, v_session.ends_at, '[)') for update;
    if v_target_reservation_id is null then
      insert into public.reservations (boat_id, created_by, start_time, end_time, status, notes) values (v_boat.fleet_boat_id, v_boat.member_ids[1], v_session.starts_at, v_session.ends_at, 'reserved', 'Created during published coached-training lineup reconciliation') returning id into v_target_reservation_id;
    end if;
    select bc.seats into v_seat_count from public.boats b join public.boat_classes bc on bc.id = b.boat_class_id where b.id = v_boat.fleet_boat_id;
    foreach v_member_id in array v_boat.member_ids loop
      if not exists (select 1 from public.reservation_crew rc where rc.reservation_id = v_target_reservation_id and rc.member_id = v_member_id) then
        if (select count(*) from public.reservation_crew rc where rc.reservation_id = v_target_reservation_id) >= v_seat_count then raise exception '% has no remaining reservation crew seats', v_boat.boat_name; end if;
        insert into public.reservation_crew (reservation_id, member_id, seat) values (v_target_reservation_id, v_member_id, null);
      end if;
      if v_changes ? v_member_id::text then
        old_boat_name := v_changes ->> v_member_id::text; new_boat_name := v_boat.boat_name; member_id := v_member_id; session_title := v_session.title;
        insert into public.notification_events (notification_key, notification_type, member_id, reservation_id, payload)
        values ('coached-training-lineup-reconciliation:' || v_session.id::text || ':' || v_member_id::text, 'coached_training_reservation_updated', v_member_id, v_target_reservation_id, jsonb_build_object('old_boat_name', old_boat_name, 'new_boat_name', new_boat_name, 'session_title', session_title, 'session_id', v_session.id))
        on conflict (notification_key) do nothing;
        if found then return next; end if;
      end if;
    end loop;
  end loop;
  update public.lineup_boards lb set is_published = true, published_at = now() where lb.id = p_lineup_board_id;
end;
$$;

revoke all on function public.publish_coached_training_lineup(uuid, jsonb, jsonb) from public;
grant execute on function public.publish_coached_training_lineup(uuid, jsonb, jsonb) to authenticated;
