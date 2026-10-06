-- Racing planning configuration and integrity.  This does not create reservations.
create table if not exists public.racing_planning_settings (
  id boolean primary key default true check (id),
  minimum_race_turnaround_minutes integer not null default 30 check (minimum_race_turnaround_minutes between 1 and 240),
  updated_at timestamptz not null default now()
);
insert into public.racing_planning_settings (id, minimum_race_turnaround_minutes)
values (true, 30) on conflict (id) do nothing;

alter table public.racing_planning_settings enable row level security;
drop policy if exists racing_planning_settings_read on public.racing_planning_settings;
create policy racing_planning_settings_read on public.racing_planning_settings for select using (true);
drop policy if exists racing_planning_settings_manage on public.racing_planning_settings;
create policy racing_planning_settings_manage on public.racing_planning_settings for all using (public.can_manage_club_data()) with check (public.can_manage_club_data());

alter table public.race_events add column if not exists entry_type text not null default 'masters'
  check (entry_type in ('masters', 'youth_boat_only'));

-- A racing member can appear in only one seat within one race board.  Other lineup
-- types retain their existing behavior.
create or replace function public.prevent_duplicate_race_lineup_member()
returns trigger language plpgsql as $$
begin
  if new.member_id is null then return new; end if;
  if exists (
    select 1
    from public.lineup_boats current_boat
    join public.lineup_boards current_board on current_board.id = current_boat.lineup_board_id
    where current_boat.id = new.lineup_boat_id
      and current_board.board_type = 'racing'
      and exists (
        select 1 from public.lineup_seats other_seat
        join public.lineup_boats other_boat on other_boat.id = other_seat.lineup_boat_id
        where other_boat.lineup_board_id = current_boat.lineup_board_id
          and other_seat.member_id = new.member_id and other_seat.id <> new.id
      )
  ) then
    raise exception 'A rower may only occupy one seat in a race lineup';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prevent_duplicate_race_lineup_member on public.lineup_seats;
create trigger trg_prevent_duplicate_race_lineup_member before insert or update of member_id, lineup_boat_id
on public.lineup_seats for each row execute function public.prevent_duplicate_race_lineup_member();
