-- V1.50: coached training can explicitly take priority over a non-participant's club-boat reservation.
-- Reservation rows remain the audit record; cancellation metadata explains why the boat was released.
alter table public.reservations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text;

create or replace function public.add_coached_training_lineup_boats(
  p_lineup_board_id uuid,
  p_boat_ids uuid[],
  p_confirmed_reservation_ids uuid[] default array[]::uuid[]
)
returns table(reservation_id uuid, member_id uuid, boat_name text, start_time timestamptz, end_time timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_session_type text;
  v_boat record;
  v_reservation record;
  v_sort_order integer;
  v_lineup_boat_id uuid;
begin
  if not public.can_manage_club_data() then
    raise exception 'Only a coach or manager can assign coached-training boats';
  end if;

  select board.session_id, session.session_type
    into v_session_id, v_session_type
  from public.lineup_boards board
  join public.sessions session on session.id = board.session_id
  where board.id = p_lineup_board_id
  for update of board, session;

  if v_session_id is null or v_session_type not in ('coached_training_beginner_intermediate', 'coached_training_advanced') then
    raise exception 'Boat priority overrides are only available for coached-training lineups';
  end if;

  select coalesce(min(sort_order), 0) - cardinality(p_boat_ids) into v_sort_order
  from public.lineup_boats where lineup_board_id = p_lineup_board_id;

  for v_boat in
    select id, name, boat_class_id from public.boats
    where id = any(p_boat_ids) and status = 'available'
    for update
  loop
    if exists (select 1 from public.lineup_boats where lineup_board_id = p_lineup_board_id and fleet_boat_id = v_boat.id) then
      raise exception '% is already in this lineup', v_boat.name;
    end if;

    select r.id, r.created_by, r.status, r.start_time, r.end_time
      into v_reservation
    from public.reservations r
    where r.boat_id = v_boat.id
      and r.status in ('reserved', 'checked_out')
      and tstzrange(r.start_time, r.end_time, '[)') && tstzrange((select starts_at from public.sessions where id = v_session_id), (select ends_at from public.sessions where id = v_session_id), '[)')
    for update;

    if found then
      if v_reservation.status <> 'reserved' then
        raise exception '% is already checked out and cannot be used for coached training', v_boat.name;
      end if;

      if not exists (select 1 from public.session_signups where session_id = v_session_id and member_id = v_reservation.created_by) then
        if not (v_reservation.id = any(coalesce(p_confirmed_reservation_ids, array[]::uuid[]))) then
          raise exception '% is still reserved by a non-participant. Confirm the override and try again.', v_boat.name;
        end if;

        update public.reservations
        set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = 'Coached training boat priority'
        where id = v_reservation.id and status = 'reserved' and created_by = v_reservation.created_by;
        if not found then
          raise exception 'The reservation for % changed before the override could be completed', v_boat.name;
        end if;

        insert into public.notification_events (notification_key, notification_type, member_id, reservation_id, payload)
        values (
          'coached-training-reservation-override:' || v_reservation.id::text,
          'reservation_overridden_for_coached_training',
          v_reservation.created_by,
          v_reservation.id,
          jsonb_build_object('boat_name', v_boat.name, 'reservation_start', v_reservation.start_time, 'reservation_end', v_reservation.end_time, 'session_id', v_session_id, 'reason', 'Coached training boat priority')
        );

        reservation_id := v_reservation.id;
        member_id := v_reservation.created_by;
        boat_name := v_boat.name;
        start_time := v_reservation.start_time;
        end_time := v_reservation.end_time;
        return next;
      end if;
    end if;

    insert into public.lineup_boats (lineup_board_id, boat_name, boat_class_id, fleet_boat_id, sort_order)
    values (p_lineup_board_id, v_boat.name, v_boat.boat_class_id, v_boat.id, v_sort_order)
    returning id into v_lineup_boat_id;
    insert into public.lineup_seats (lineup_boat_id, seat_number, member_id)
    select v_lineup_boat_id, seat_number, null
    from generate_series(1, case v_boat.boat_class_id when '8x' then 8 when '4x' then 4 when '2x' then 2 else 1 end) as seat_number;
    v_sort_order := v_sort_order + 1;
  end loop;

  if (select count(*) from public.boats where id = any(p_boat_ids) and status = 'available') <> cardinality(p_boat_ids) then
    raise exception 'One or more selected fleet boats are no longer available';
  end if;
end;
$$;

revoke all on function public.add_coached_training_lineup_boats(uuid, uuid[], uuid[]) from public;
grant execute on function public.add_coached_training_lineup_boats(uuid, uuid[], uuid[]) to authenticated;
