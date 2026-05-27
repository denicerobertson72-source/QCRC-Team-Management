-- Rowing Club V1 schema (Supabase/Postgres)
-- Core: profiles, boats, clearances, reservations, damage workflow, sessions

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------- Enums ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('member', 'coach', 'equipment_manager', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum ('active', 'suspended', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'boat_status_v1') then
    create type public.boat_status_v1 as enum ('available', 'maintenance', 'locked');
  end if;

  if not exists (select 1 from pg_type where typname = 'reservation_status_v1') then
    create type public.reservation_status_v1 as enum ('reserved', 'checked_out', 'checked_in', 'cancelled', 'no_show');
  end if;

  if not exists (select 1 from pg_type where typname = 'damage_status_v1') then
    create type public.damage_status_v1 as enum ('new', 'triaged', 'in_repair', 'resolved');
  end if;
end $$;

-- ---------- Member profile + permissions ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  waiver_signed_at timestamptz,
  dues_ok boolean not null default false,
  membership_type text not null default 'community', -- community / competitive / ltr
  role public.app_role not null default 'member',
  status public.member_status not null default 'active',
  coach_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);
create index if not exists profiles_coach_idx on public.profiles(coach_id);

create table if not exists public.boat_classes (
  id text primary key, -- 1x,2x,4x
  name text not null,
  seats int not null check (seats in (1,2,4))
);

insert into public.boat_classes (id, name, seats)
values
  ('1x', 'Single', 1),
  ('2x', 'Double', 2),
  ('4x', 'Quad', 4)
on conflict (id) do update
set name = excluded.name,
    seats = excluded.seats;

create table if not exists public.member_clearances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  boat_class_id text not null references public.boat_classes(id) on delete restrict,
  clearance_level int not null check (clearance_level between 1 and 4),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz not null default now(),
  notes text,
  unique (member_id, boat_class_id)
);

create index if not exists member_clearances_member_idx on public.member_clearances(member_id);
create index if not exists member_clearances_boat_class_idx on public.member_clearances(boat_class_id);

-- ---------- Boats + inventory ----------
create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  boat_class_id text not null references public.boat_classes(id) on delete restrict,
  boat_type text not null default 'training', -- stable / training / performance / race
  weight_class text,
  rig text,
  fin text,
  required_clearance int not null default 1 check (required_clearance between 1 and 4),
  minimum_clearance_required int generated always as (required_clearance) stored,
  status public.boat_status_v1 not null default 'available',
  photo_url text,
  rigging_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boats_class_idx on public.boats(boat_class_id);
create index if not exists boats_status_idx on public.boats(status);
create index if not exists boats_required_clearance_idx on public.boats(required_clearance);

create table if not exists public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  logged_by uuid references public.profiles(id) on delete set null,
  log_date date not null default current_date,
  description text not null,
  labor_cost numeric(10,2) not null default 0,
  parts_cost numeric(10,2) not null default 0,
  total_cost numeric(10,2) generated always as (labor_cost + parts_cost) stored,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_logs_boat_idx on public.maintenance_logs(boat_id);
create index if not exists maintenance_logs_date_idx on public.maintenance_logs(log_date);

-- ---------- Reservations + sign-out ----------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.reservation_status_v1 not null default 'reserved',
  checked_out_at timestamptz,
  checked_in_at timestamptz,
  checkout_location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  time_range tstzrange generated always as (tstzrange(start_time, end_time, '[)')) stored,
  check (end_time > start_time)
);

create index if not exists reservations_boat_idx on public.reservations(boat_id);
create index if not exists reservations_created_by_idx on public.reservations(created_by);
create index if not exists reservations_status_idx on public.reservations(status);
create index if not exists reservations_time_idx on public.reservations(start_time, end_time);

-- Prevent double-booking per boat for active reservations.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_no_overlap_per_boat_v1'
  ) then
    alter table public.reservations
      add constraint reservations_no_overlap_per_boat_v1
      exclude using gist (
        boat_id with =,
        time_range with &&
      )
      where (status not in ('cancelled', 'no_show'));
  end if;
end $$;

create table if not exists public.reservation_crew (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete restrict,
  seat text,
  primary key (reservation_id, member_id)
);

create index if not exists reservation_crew_member_idx on public.reservation_crew(member_id);

-- ---------- Damage / incidents ----------
create table if not exists public.damage_reports (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  boat_id uuid not null references public.boats(id) on delete restrict,
  reported_by uuid not null references public.profiles(id) on delete restrict,
  responsible_member_id uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  severity int not null check (severity between 1 and 5),
  description text not null,
  status public.damage_status_v1 not null default 'new',
  locked_boat boolean not null default false,
  triaged_by uuid references public.profiles(id) on delete set null,
  triaged_at timestamptz,
  resolution_notes text,
  resolved_at timestamptz
);

create index if not exists damage_reports_boat_idx on public.damage_reports(boat_id);
create index if not exists damage_reports_status_idx on public.damage_reports(status);
create index if not exists damage_reports_reported_at_idx on public.damage_reports(reported_at);

create table if not exists public.damage_photos (
  id uuid primary key default gen_random_uuid(),
  damage_report_id uuid not null references public.damage_reports(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create index if not exists damage_photos_report_idx on public.damage_photos(damage_report_id);

-- ---------- Sessions (optional V1 module) ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  session_type text not null, -- community_row / technique / race_prep / coaching
  coach_id uuid references public.profiles(id) on delete set null,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int check (capacity is null or capacity > 0),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.session_signups (
  session_id uuid not null references public.sessions(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  attended boolean,
  boat_id uuid references public.boats(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (session_id, member_id)
);

create index if not exists sessions_starts_at_idx on public.sessions(starts_at);
create index if not exists session_signups_member_idx on public.session_signups(member_id);

-- ---------- Trigger helpers ----------
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_boats_updated_at on public.boats;
create trigger trg_boats_updated_at
before update on public.boats
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
before update on public.reservations
for each row execute function public.fn_set_updated_at();

-- Seed default level-1 clearances for each new profile.
create or replace function public.fn_seed_member_clearances()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.member_clearances (member_id, boat_class_id, clearance_level, approved_by, notes)
  select new.id, bc.id, 1, new.id, 'Auto-seeded default clearance'
  from public.boat_classes bc
  on conflict (member_id, boat_class_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_member_clearances on public.profiles;
create trigger trg_seed_member_clearances
after insert on public.profiles
for each row execute function public.fn_seed_member_clearances();

-- Auto-lock boats on severe damage.
create or replace function public.fn_damage_autolock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold int := 3;
begin
  if new.severity >= v_threshold then
    new.locked_boat := true;
    update public.boats set status = 'locked' where id = new.boat_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_damage_autolock on public.damage_reports;
create trigger trg_damage_autolock
before insert on public.damage_reports
for each row execute function public.fn_damage_autolock();

-- ---------- Analytics-friendly views ----------
create or replace view public.v_boat_usage_hours as
select
  b.id as boat_id,
  b.name as boat_name,
  b.boat_class_id,
  date_trunc('month', r.start_time) as usage_month,
  sum(extract(epoch from (r.end_time - r.start_time)) / 3600.0) as reserved_hours,
  sum(
    case
      when r.checked_out_at is not null and r.checked_in_at is not null
      then extract(epoch from (r.checked_in_at - r.checked_out_at)) / 3600.0
      else 0
    end
  ) as on_water_hours
from public.boats b
join public.reservations r on r.boat_id = b.id
where r.status in ('reserved', 'checked_out', 'checked_in')
group by b.id, b.name, b.boat_class_id, date_trunc('month', r.start_time);

create or replace view public.v_damage_by_boat as
select
  b.id as boat_id,
  b.name as boat_name,
  b.boat_class_id,
  count(dr.id) as damage_reports,
  avg(dr.severity)::numeric(10,2) as avg_severity,
  max(dr.reported_at) as last_reported_at
from public.boats b
left join public.damage_reports dr on dr.boat_id = b.id
group by b.id, b.name, b.boat_class_id;
