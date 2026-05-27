-- V1.5 skill/weight matching and boat metadata

-- ---------- Profiles ----------
alter table public.profiles
  add column if not exists skill_level text,
  add column if not exists weight_class text;

update public.profiles
set skill_level = coalesce(skill_level, 'Beginner'),
    weight_class = coalesce(weight_class, 'Mid-weight');

alter table public.profiles
  alter column skill_level set default 'Beginner',
  alter column skill_level set not null,
  alter column weight_class set default 'Mid-weight',
  alter column weight_class set not null;

-- Replace checks idempotently
alter table public.profiles drop constraint if exists profiles_skill_level_check;
alter table public.profiles add constraint profiles_skill_level_check
  check (skill_level in ('LTR', 'Beginner', 'Intermediate', 'Advanced', 'Elite'));

alter table public.profiles drop constraint if exists profiles_weight_class_check;
alter table public.profiles add constraint profiles_weight_class_check
  check (weight_class in ('Lightweight', 'Mid-weight', 'Heavyweight'));

-- ---------- Boats ----------
alter table public.boats
  add column if not exists boat_number text,
  add column if not exists required_skill_level text;

update public.boats
set required_skill_level = coalesce(required_skill_level, 'Beginner');

alter table public.boats
  alter column required_skill_level set default 'Beginner',
  alter column required_skill_level set not null;

alter table public.boats drop constraint if exists boats_required_skill_level_check;
alter table public.boats add constraint boats_required_skill_level_check
  check (required_skill_level in ('LTR', 'Beginner', 'Intermediate', 'Advanced', 'Elite'));

alter table public.boats drop constraint if exists boats_weight_class_check;
alter table public.boats add constraint boats_weight_class_check
  check (weight_class is null or weight_class in ('Lightweight', 'Mid-weight', 'Heavyweight'));

-- ---------- Skill rank helper ----------
create or replace function public.skill_level_rank(p_level text)
returns int
language sql
immutable
as $$
  select case p_level
    when 'LTR' then 1
    when 'Beginner' then 2
    when 'Intermediate' then 3
    when 'Advanced' then 4
    when 'Elite' then 5
    else 0
  end;
$$;

create or replace function public.skill_level_to_clearance(p_level text)
returns int
language sql
immutable
as $$
  select case p_level
    when 'Elite' then 4
    when 'Advanced' then 3
    when 'Intermediate' then 2
    when 'Beginner' then 1
    when 'LTR' then 1
    else 0
  end;
$$;

-- ---------- Reservation eligibility ----------
create or replace function public.can_user_reserve_boat(
  p_user_id uuid,
  p_boat_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with profile_cte as (
    select p.*
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and p.dues_ok = true
      and p.waiver_signed_at is not null
  ),
  boat_cte as (
    select b.*
    from public.boats b
    where b.id = p_boat_id
      and b.status = 'available'
  ),
  eligibility_cte as (
    select
      greatest(mc.clearance_level, public.skill_level_to_clearance(p.skill_level)) as effective_clearance,
      b.required_clearance
    from profile_cte p
    join boat_cte b on true
    join public.member_clearances mc
      on mc.member_id = p.id
     and mc.boat_class_id = b.boat_class_id
  )
  select
    p_end_time > p_start_time
    and exists(select 1 from profile_cte)
    and exists(select 1 from boat_cte)
    and exists(
      select 1
      from eligibility_cte c
      where c.effective_clearance >= c.required_clearance
    )
    and exists(
      select 1
      from profile_cte p
      join boat_cte b on true
      where public.skill_level_rank(p.skill_level) >= public.skill_level_rank(b.required_skill_level)
        and (b.weight_class is null or b.weight_class = p.weight_class)
    );
$$;

-- ---------- Availability RPC ----------
create or replace function public.available_boats_for_window(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_boat_class_id text default null
)
returns setof public.boats
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.skill_level, p.weight_class
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.dues_ok = true
      and p.waiver_signed_at is not null
  )
  select b.*
  from public.boats b
  join me on true
  left join public.member_clearances mc
    on mc.member_id = me.id
   and mc.boat_class_id = b.boat_class_id
  where b.status = 'available'
    and greatest(coalesce(mc.clearance_level, 0), public.skill_level_to_clearance(me.skill_level)) >= b.required_clearance
    and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level)
    and (b.weight_class is null or b.weight_class = me.weight_class)
    and p_end_time > p_start_time
    and (p_boat_class_id is null or b.boat_class_id = p_boat_class_id)
    and not exists (
      select 1
      from public.reservations r
      where r.boat_id = b.id
        and r.status not in ('cancelled', 'no_show')
        and tstzrange(r.start_time, r.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    )
  order by b.boat_class_id, b.required_clearance, b.name;
$$;
