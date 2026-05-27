-- V1.12: allow rowers to specify how many races they want per regatta

alter table public.race_signups
  add column if not exists desired_race_count int not null default 1;

alter table public.race_signups
  drop constraint if exists race_signups_desired_race_count_check;

alter table public.race_signups
  add constraint race_signups_desired_race_count_check
  check (desired_race_count between 1 and 4);
