-- V1.10: Date-specific lineups per session + per-boat race times

alter table public.lineup_boards
  add column if not exists session_id uuid references public.sessions(id) on delete cascade;

create unique index if not exists lineup_boards_unique_session_idx
  on public.lineup_boards(session_id)
  where session_id is not null;

alter table public.lineup_boats
  add column if not exists race_time timestamptz;
