-- race_events are named regattas; each lineup_boat is an individual event/boat commitment.
-- Replace migration 069's board-wide guard so rowers may race multiple events at one regatta.
drop trigger if exists trg_prevent_duplicate_race_lineup_member on public.lineup_seats;
drop function if exists public.prevent_duplicate_race_lineup_member();

create or replace function public.prevent_duplicate_race_event_member()
returns trigger language plpgsql as $$
begin
  if new.member_id is null then return new; end if;
  if exists (
    select 1 from public.lineup_boats boat
    join public.lineup_boards board on board.id = boat.lineup_board_id
    where boat.id = new.lineup_boat_id and board.board_type = 'racing'
      and exists (
        select 1 from public.lineup_seats other_seat
        where other_seat.lineup_boat_id = new.lineup_boat_id
          and other_seat.member_id = new.member_id and other_seat.id <> new.id
      )
  ) then
    raise exception 'A rower may only occupy one seat in an event lineup';
  end if;
  return new;
end;
$$;
create trigger trg_prevent_duplicate_race_event_member before insert or update of member_id, lineup_boat_id
on public.lineup_seats for each row execute function public.prevent_duplicate_race_event_member();
