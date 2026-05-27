-- RLS + policies for QCRC Team Management

-- Helper: admin check
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from admins where user_id = auth.uid()
  );
$$;

-- Helper: member id for current user
create or replace function current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from members where user_id = auth.uid() limit 1;
$$;

-- Optional helper: can reserve
create or replace function can_reserve(
  p_member_id uuid,
  p_boat_id uuid,
  p_section_id uuid,
  p_date date,
  p_time_slot_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with member_cte as (
    select * from members where id = p_member_id and active = true
  ),
  boat_cte as (
    select * from boats where id = p_boat_id and status = 'active'
  ),
  slot_cte as (
    select * from time_slots where id = p_time_slot_id and section_id = p_section_id
  ),
  blackout_cte as (
    select 1
    from blackouts b
    join slot_cte s on true
    where b.date = p_date
      and (b.section_id is null or b.section_id = p_section_id)
      and (b.start_time, b.end_time) overlaps (s.start_time, s.end_time)
    limit 1
  )
  select
    exists(select 1 from member_cte m)
    and exists(select 1 from boat_cte b)
    and exists(select 1 from slot_cte s)
    and (select m.skill_level from member_cte m) >= (select b.min_skill_level from boat_cte b)
    and not exists(select 1 from blackout_cte);
$$;

-- Enable RLS
alter table members enable row level security;
alter table admins enable row level security;
alter table sections enable row level security;
alter table boats enable row level security;
alter table time_slots enable row level security;
alter table blackouts enable row level security;
alter table reservations enable row level security;

-- Admins table
create policy "admins manage"
on admins
for all
using (is_admin())
with check (is_admin());

-- Members table
create policy "admins manage members"
on members
for all
using (is_admin())
with check (is_admin());

create policy "members read self"
on members
for select
using (user_id = auth.uid());

-- Sections
create policy "sections read"
on sections
for select
using (auth.role() = 'authenticated');

create policy "sections manage"
on sections
for all
using (is_admin())
with check (is_admin());

-- Boats
create policy "boats read"
on boats
for select
using (auth.role() = 'authenticated');

create policy "boats manage"
on boats
for all
using (is_admin())
with check (is_admin());

-- Time slots
create policy "time slots read"
on time_slots
for select
using (auth.role() = 'authenticated');

create policy "time slots manage"
on time_slots
for all
using (is_admin())
with check (is_admin());

-- Blackouts
create policy "blackouts read"
on blackouts
for select
using (auth.role() = 'authenticated');

create policy "blackouts manage"
on blackouts
for all
using (is_admin())
with check (is_admin());

-- Reservations
create policy "reservations read own"
on reservations
for select
using (
  is_admin()
  or member_id = current_member_id()
);

create policy "reservations create"
on reservations
for insert
with check (
  member_id = current_member_id()
  and can_reserve(member_id, boat_id, section_id, date, time_slot_id)
);

create policy "reservations delete"
on reservations
for delete
using (
  is_admin()
  or member_id = current_member_id()
);
