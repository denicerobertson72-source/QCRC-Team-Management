-- V1.13: launch metadata for safety tracking

alter table public.reservations
  add column if not exists river_direction text;

alter table public.reservations
  drop constraint if exists reservations_river_direction_check;

alter table public.reservations
  add constraint reservations_river_direction_check
  check (river_direction is null or river_direction in ('Upriver', 'Downriver'));

create index if not exists reservations_checked_out_at_idx on public.reservations(checked_out_at);
