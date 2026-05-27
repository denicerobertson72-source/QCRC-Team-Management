-- V1.8: Programs, race signups, and published lineups

create table if not exists public.program_signups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  program_type text not null check (program_type in ('saturday_coached_row','coached_training')),
  training_group text check (training_group in ('beginner_intermediate','advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, program_type)
);

create table if not exists public.race_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  location text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.race_signups (
  id uuid primary key default gen_random_uuid(),
  race_event_id uuid not null references public.race_events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  birthdate date not null,
  wants_1x boolean not null default false,
  wants_2x boolean not null default false,
  wants_4x boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_event_id, member_id)
);

create table if not exists public.lineup_boards (
  id uuid primary key default gen_random_uuid(),
  board_type text not null check (board_type in ('saturday_coached_row','coached_training_beginner_intermediate','coached_training_advanced','racing')),
  race_event_id uuid references public.race_events(id) on delete cascade,
  title text not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lineup_boards_type_idx on public.lineup_boards(board_type, race_event_id);

create table if not exists public.lineup_boats (
  id uuid primary key default gen_random_uuid(),
  lineup_board_id uuid not null references public.lineup_boards(id) on delete cascade,
  boat_name text not null,
  boat_class_id text not null references public.boat_classes(id) on delete restrict,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lineup_seats (
  id uuid primary key default gen_random_uuid(),
  lineup_boat_id uuid not null references public.lineup_boats(id) on delete cascade,
  seat_number int not null check (seat_number between 1 and 4),
  member_id uuid references public.profiles(id) on delete set null,
  unique (lineup_boat_id, seat_number)
);

create index if not exists lineup_seats_member_idx on public.lineup_seats(member_id);

-- updated_at triggers
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_program_signups_updated_at on public.program_signups;
create trigger trg_program_signups_updated_at
before update on public.program_signups
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_race_events_updated_at on public.race_events;
create trigger trg_race_events_updated_at
before update on public.race_events
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_race_signups_updated_at on public.race_signups;
create trigger trg_race_signups_updated_at
before update on public.race_signups
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_lineup_boards_updated_at on public.lineup_boards;
create trigger trg_lineup_boards_updated_at
before update on public.lineup_boards
for each row execute function public.fn_set_updated_at();

-- RLS
alter table public.program_signups enable row level security;
alter table public.race_events enable row level security;
alter table public.race_signups enable row level security;
alter table public.lineup_boards enable row level security;
alter table public.lineup_boats enable row level security;
alter table public.lineup_seats enable row level security;

-- program_signups
drop policy if exists program_signups_read_own_or_manage on public.program_signups;
create policy program_signups_read_own_or_manage
on public.program_signups
for select
using (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists program_signups_insert_own on public.program_signups;
create policy program_signups_insert_own
on public.program_signups
for insert
with check (member_id = auth.uid());

drop policy if exists program_signups_update_own_or_manage on public.program_signups;
create policy program_signups_update_own_or_manage
on public.program_signups
for update
using (member_id = auth.uid() or public.can_manage_club_data())
with check (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists program_signups_delete_own_or_manage on public.program_signups;
create policy program_signups_delete_own_or_manage
on public.program_signups
for delete
using (member_id = auth.uid() or public.can_manage_club_data());

-- race_events
drop policy if exists race_events_read_all on public.race_events;
create policy race_events_read_all
on public.race_events
for select
using (auth.role() = 'authenticated');

drop policy if exists race_events_manage on public.race_events;
create policy race_events_manage
on public.race_events
for all
using (public.can_manage_club_data())
with check (public.can_manage_club_data());

-- race_signups
drop policy if exists race_signups_read_own_or_manage on public.race_signups;
create policy race_signups_read_own_or_manage
on public.race_signups
for select
using (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists race_signups_insert_own on public.race_signups;
create policy race_signups_insert_own
on public.race_signups
for insert
with check (member_id = auth.uid());

drop policy if exists race_signups_update_own_or_manage on public.race_signups;
create policy race_signups_update_own_or_manage
on public.race_signups
for update
using (member_id = auth.uid() or public.can_manage_club_data())
with check (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists race_signups_delete_own_or_manage on public.race_signups;
create policy race_signups_delete_own_or_manage
on public.race_signups
for delete
using (member_id = auth.uid() or public.can_manage_club_data());

-- lineup boards visible when published (or manager)
drop policy if exists lineup_boards_read_published_or_manage on public.lineup_boards;
create policy lineup_boards_read_published_or_manage
on public.lineup_boards
for select
using (is_published = true or public.can_manage_club_data());

drop policy if exists lineup_boards_manage on public.lineup_boards;
create policy lineup_boards_manage
on public.lineup_boards
for all
using (public.can_manage_club_data())
with check (public.can_manage_club_data());

-- safer explicit policies for lineup boats/seats
drop policy if exists lineup_boats_read_by_board on public.lineup_boats;
create policy lineup_boats_read_by_board
on public.lineup_boats
for select
using (
  exists (
    select 1
    from public.lineup_boards lb
    where lb.id = lineup_boats.lineup_board_id
      and (lb.is_published = true or public.can_manage_club_data())
  )
);

drop policy if exists lineup_boats_manage on public.lineup_boats;
create policy lineup_boats_manage
on public.lineup_boats
for all
using (public.can_manage_club_data())
with check (public.can_manage_club_data());

drop policy if exists lineup_seats_read_by_board on public.lineup_seats;
create policy lineup_seats_read_by_board
on public.lineup_seats
for select
using (
  exists (
    select 1
    from public.lineup_boats lbt
    join public.lineup_boards lb on lb.id = lbt.lineup_board_id
    where lbt.id = lineup_seats.lineup_boat_id
      and (lb.is_published = true or public.can_manage_club_data())
  )
);

drop policy if exists lineup_seats_manage on public.lineup_seats;
create policy lineup_seats_manage
on public.lineup_seats
for all
using (public.can_manage_club_data())
with check (public.can_manage_club_data());
