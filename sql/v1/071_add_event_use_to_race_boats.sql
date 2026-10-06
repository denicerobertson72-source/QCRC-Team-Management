-- A regatta contains both Masters events and Youth boat-only commitments.
alter table public.lineup_boats
  add column if not exists entry_type text not null default 'masters'
  check (entry_type in ('masters', 'youth_boat_only'));

-- Preserve existing data.  Old regatta-wide Youth entries become Youth commitments;
-- deliberately do not delete any pre-existing seats.
update public.lineup_boats boat
set entry_type = 'youth_boat_only'
from public.lineup_boards board
join public.race_events regatta on regatta.id = board.race_event_id
where boat.lineup_board_id = board.id
  and board.board_type = 'racing'
  and regatta.entry_type = 'youth_boat_only';
