-- V1.7: Global and group-specific boat availability blocks

create table if not exists public.boat_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  applies_to_membership_type text,
  applies_to_boat_class_id text references public.boat_classes(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists boat_availability_blocks_time_idx
  on public.boat_availability_blocks(starts_at, ends_at);
create index if not exists boat_availability_blocks_active_idx
  on public.boat_availability_blocks(is_active);

create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_boat_availability_blocks_updated_at on public.boat_availability_blocks;
create trigger trg_boat_availability_blocks_updated_at
before update on public.boat_availability_blocks
for each row execute function public.fn_set_updated_at();

alter table public.boat_availability_blocks enable row level security;

drop policy if exists boat_availability_blocks_read on public.boat_availability_blocks;
create policy boat_availability_blocks_read
on public.boat_availability_blocks
for select
using (auth.role() = 'authenticated');

drop policy if exists boat_availability_blocks_manage on public.boat_availability_blocks;
create policy boat_availability_blocks_manage
on public.boat_availability_blocks
for all
using (public.can_manage_club_data())
with check (public.can_manage_club_data());

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
    )
    and not exists (
      select 1
      from public.boat_availability_blocks blk
      join profile_cte p on true
      join boat_cte b on true
      where blk.is_active = true
        and tstzrange(blk.starts_at, blk.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')
        and (blk.applies_to_membership_type is null or blk.applies_to_membership_type = p.membership_type)
        and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id = b.boat_class_id)
    );
$$;

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
    select p.id, p.skill_level, p.weight_class, p.membership_type
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
    and not exists (
      select 1
      from public.boat_availability_blocks blk
      where blk.is_active = true
        and tstzrange(blk.starts_at, blk.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')
        and (blk.applies_to_membership_type is null or blk.applies_to_membership_type = me.membership_type)
        and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id = b.boat_class_id)
    )
  order by b.boat_class_id, b.required_clearance, b.name;
$$;
