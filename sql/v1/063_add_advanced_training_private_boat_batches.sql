-- V1.63: atomically add reusable lineup-only private boats to an Advanced Training lineup.
create or replace function public.add_advanced_training_private_lineup_boats(
  p_lineup_board_id uuid,
  p_boat_class_id text,
  p_quantity integer
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_first_sort_order integer;
  v_seat_count integer;
begin
  if not public.can_manage_club_data() then raise exception 'Only a coach or manager can add Advanced Training lineup boats'; end if;
  if p_boat_class_id not in ('1x', '2x', '4x') then raise exception 'Private boats must be 1x, 2x, or 4x'; end if;
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
  v_seat_count := case p_boat_class_id when '1x' then 1 when '2x' then 2 else 4 end;

  with inserted_boats as (
    insert into public.lineup_boats (lineup_board_id, boat_name, boat_class_id, fleet_boat_id, sort_order)
    select p_lineup_board_id, 'Private Boat', p_boat_class_id, null, v_first_sort_order - p_quantity + batch.position
    from generate_series(1, p_quantity) as batch(position)
    returning id
  )
  insert into public.lineup_seats (lineup_boat_id, seat_number, member_id)
  select inserted_boats.id, seats.seat_number, null
  from inserted_boats
  cross join generate_series(1, v_seat_count) as seats(seat_number);
end;
$$;

grant execute on function public.add_advanced_training_private_lineup_boats(uuid, text, integer) to authenticated;
