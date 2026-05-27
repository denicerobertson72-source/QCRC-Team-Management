-- QCRC Team Management schema
-- Designed for Supabase (Postgres)

create extension if not exists "pgcrypto";

-- Enum-like types for safety
create type boat_type as enum ('1x', '2x', '4x');
create type boat_status as enum ('active', 'maintenance');

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique, -- nullable until member first logs in
  email text unique not null,
  name text not null,
  skill_level int not null check (skill_level between 1 and 5),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admins (
  user_id uuid primary key
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists boats (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  type boat_type not null,
  min_skill_level int not null check (min_skill_level between 1 and 5),
  status boat_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists time_slots (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  unique (section_id, day_of_week, start_time, end_time)
);

create table if not exists blackouts (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  boat_id uuid not null references boats(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  date date not null,
  time_slot_id uuid not null references time_slots(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (boat_id, date, time_slot_id)
);

-- Helpful indexes
create index if not exists idx_members_email on members (email);
create index if not exists idx_reservations_member_date on reservations (member_id, date);
create index if not exists idx_reservations_section_date on reservations (section_id, date);
create index if not exists idx_blackouts_section_date on blackouts (section_id, date);

-- Seed sections
insert into sections (name) values
  ('Training'),
  ('Reservations'),
  ('Community'),
  ('Racing')
on conflict (name) do nothing;

-- Updated at trigger (optional)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_members_updated_at
before update on members
for each row execute function set_updated_at();

create trigger set_boats_updated_at
before update on boats
for each row execute function set_updated_at();
