-- V1.73: operational boats taken to a regatta stay operational, but are
-- temporarily unavailable until their specific regatta batch is released.
create table if not exists public.regatta_boat_holds (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.regatta_boat_hold_boats (
  regatta_boat_hold_id uuid not null references public.regatta_boat_holds(id) on delete cascade,
  boat_id uuid not null references public.boats(id) on delete cascade,
  primary key (regatta_boat_hold_id, boat_id)
);

create index if not exists regatta_boat_holds_active_idx on public.regatta_boat_holds(created_at) where released_at is null;
create index if not exists regatta_boat_hold_boats_boat_idx on public.regatta_boat_hold_boats(boat_id);

alter table public.regatta_boat_holds enable row level security;
alter table public.regatta_boat_hold_boats enable row level security;

create policy regatta_boat_holds_admin_manage on public.regatta_boat_holds
  for all using (public.can_manage_club_data()) with check (public.can_manage_club_data());
create policy regatta_boat_hold_boats_admin_manage on public.regatta_boat_hold_boats
  for all using (public.can_manage_club_data()) with check (public.can_manage_club_data());

create or replace function public.create_regatta_boat_hold(p_label text, p_boat_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hold_id uuid; v_invalid_boats text; v_reserved_boats text; v_already_held_boats text;
begin
  if not public.can_manage_club_data() then raise exception 'Only a coach or manager can block regatta boats'; end if;
  if coalesce(cardinality(p_boat_ids), 0) = 0 then raise exception 'Choose at least one boat'; end if;
  if (select count(distinct boat_id) from unnest(p_boat_ids) as selected(boat_id)) <> cardinality(p_boat_ids) then raise exception 'Choose each boat only once'; end if;

  select string_agg(b.name, ', ' order by b.name) into v_invalid_boats
  from public.boats b where b.id = any(p_boat_ids) and b.status <> 'available';
  if v_invalid_boats is not null then raise exception 'Only operational boats can be placed on a regatta hold: %', v_invalid_boats; end if;
  if (select count(*) from public.boats where id = any(p_boat_ids)) <> cardinality(p_boat_ids) then raise exception 'One or more selected boats no longer exist'; end if;

  select string_agg(distinct b.name, ', ' order by b.name) into v_already_held_boats
  from public.regatta_boat_holds rh join public.regatta_boat_hold_boats rhb on rhb.regatta_boat_hold_id = rh.id join public.boats b on b.id = rhb.boat_id
  where rh.released_at is null and rhb.boat_id = any(p_boat_ids);
  if v_already_held_boats is not null then raise exception 'These boats are already on an active regatta hold: %', v_already_held_boats; end if;

  select string_agg(distinct b.name, ', ' order by b.name) into v_reserved_boats
  from public.reservations r join public.boats b on b.id = r.boat_id
  where r.boat_id = any(p_boat_ids) and r.status in ('reserved', 'checked_out') and r.end_time > now();
  if v_reserved_boats is not null then raise exception 'Cannot create this regatta hold while these boats have active or upcoming reservations: %', v_reserved_boats; end if;

  insert into public.regatta_boat_holds(label, created_by) values (coalesce(nullif(trim(p_label), ''), 'Regatta'), auth.uid()) returning id into v_hold_id;
  insert into public.regatta_boat_hold_boats(regatta_boat_hold_id, boat_id)
  select v_hold_id, selected.boat_id from unnest(p_boat_ids) as selected(boat_id);
  return v_hold_id;
end;
$$;

create or replace function public.release_regatta_boat_hold(p_hold_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_club_data() then raise exception 'Only a coach or manager can release regatta boats'; end if;
  update public.regatta_boat_holds set released_at = now(), released_by = auth.uid() where id = p_hold_id and released_at is null;
  if not found then raise exception 'That regatta hold is already released or no longer exists'; end if;
end;
$$;

revoke all on function public.create_regatta_boat_hold(text, uuid[]) from public;
grant execute on function public.create_regatta_boat_hold(text, uuid[]) to authenticated;
revoke all on function public.release_regatta_boat_hold(uuid) from public;
grant execute on function public.release_regatta_boat_hold(uuid) to authenticated;

create or replace function public.available_boats_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns setof public.boats language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.skill_level, p.weight_class from public.profiles p where p.id = auth.uid() and p.status = 'active')
  select b.* from public.boats b join me on true where b.status = 'available' and public.skill_level_to_clearance(me.skill_level) >= b.required_clearance and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(me.weight_class)) and p_end_time > p_start_time and (p_boat_class_id is null or b.boat_class_id = p_boat_class_id) and not exists (select 1 from public.reservations r where r.boat_id=b.id and r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')) and not exists (select 1 from public.reservations own_r where own_r.created_by=auth.uid() and own_r.status in ('reserved','checked_out') and tstzrange(own_r.start_time - interval '90 minutes', own_r.end_time + interval '90 minutes','[)') && tstzrange(p_start_time,p_end_time,'[)')) and not exists (select 1 from public.regatta_boat_holds rh join public.regatta_boat_hold_boats rhb on rhb.regatta_boat_hold_id=rh.id where rh.released_at is null and rhb.boat_id=b.id)
  order by b.boat_class_id, b.required_clearance, b.name;
$$;

create or replace function public.available_boat_ids_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns table(id uuid) language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.skill_level, p.weight_class, p.membership_type from public.profiles p where p.id = auth.uid() and p.status = 'active')
  select b.id from public.boats b join me on true where b.status = 'available' and public.skill_level_to_clearance(me.skill_level) >= b.required_clearance and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(me.weight_class)) and p_end_time > p_start_time and (p_boat_class_id is null or b.boat_class_id = p_boat_class_id) and not public.boat_in_program_lineup_window(b.id,p_start_time,p_end_time) and not exists (select 1 from public.reservations r where r.boat_id=b.id and r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')) and not exists (select 1 from public.boat_availability_blocks blk where blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=me.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=b.boat_class_id)) and not exists (select 1 from public.regatta_boat_holds rh join public.regatta_boat_hold_boats rhb on rhb.regatta_boat_hold_id=rh.id where rh.released_at is null and rhb.boat_id=b.id) and not exists (select 1 from public.training_boat_holds h join public.sessions s on s.id = h.session_id where h.boat_id = b.id and s.session_type = 'coached_training_advanced' and s.is_cancelled = false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)') and not exists (select 1 from public.session_signups ss where ss.session_id = h.session_id and ss.member_id = me.id));
$$;

create or replace function public.can_user_reserve_boat(p_user_id uuid, p_boat_id uuid, p_start_time timestamptz, p_end_time timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_end_time > p_start_time and not public.boat_in_program_lineup_window(p_boat_id,p_start_time,p_end_time) and exists (select 1 from public.profiles p join public.boats b on b.id=p_boat_id where p.id=p_user_id and p.status='active' and b.status='available' and public.skill_level_to_clearance(p.skill_level)>=b.required_clearance and public.skill_level_rank(p.skill_level)>=public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class)>=public.weight_class_rank(p.weight_class)) and not exists (select 1 from public.boat_availability_blocks blk where blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=p.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=b.boat_class_id)) and not exists (select 1 from public.regatta_boat_holds rh join public.regatta_boat_hold_boats rhb on rhb.regatta_boat_hold_id=rh.id where rh.released_at is null and rhb.boat_id=b.id) and not exists (select 1 from public.training_boat_holds h join public.sessions s on s.id=h.session_id where h.boat_id=b.id and s.session_type='coached_training_advanced' and s.is_cancelled=false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)') and not exists (select 1 from public.session_signups ss where ss.session_id=h.session_id and ss.member_id=p_user_id)));
$$;

drop function if exists public.unavailable_boats_for_window(timestamptz, timestamptz, text);
create or replace function public.unavailable_boats_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns table(boat_id uuid, reservation_status text, expected_return_at timestamptz, availability_title text)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.skill_level, p.weight_class, p.membership_type from public.profiles p where p.id = auth.uid() and p.status = 'active'), eligible_boats as (select b.id, b.boat_class_id from public.boats b join me on true where b.status='available' and public.skill_level_to_clearance(me.skill_level)>=b.required_clearance and public.skill_level_rank(me.skill_level)>=public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class)>=public.weight_class_rank(me.weight_class)) and (p_boat_class_id is null or b.boat_class_id=p_boat_class_id)), reasons as (
    select r.boat_id, r.status::text, r.end_time, null::text, case when r.status = 'checked_out' then 1 else 2 end from public.reservations r join eligible_boats b on b.id=r.boat_id where r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')
    union all select rhb.boat_id, 'regatta_hold'::text, null::timestamptz, rh.label, 3 from public.regatta_boat_holds rh join public.regatta_boat_hold_boats rhb on rhb.regatta_boat_hold_id=rh.id join eligible_boats b on b.id=rhb.boat_id where rh.released_at is null
    union all select b.id, 'availability_block'::text, null::timestamptz, blk.title, 4 from eligible_boats b join me on true join public.boat_availability_blocks blk on blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=me.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=b.boat_class_id)
    union all select b.id, 'training_hold'::text, h.ends_at, coalesce(s.title, 'Advanced Training'), 5 from eligible_boats b join me on true join public.training_boat_holds h on h.boat_id = b.id join public.sessions s on s.id = h.session_id where s.session_type = 'coached_training_advanced' and s.is_cancelled = false and tstzrange(h.starts_at,h.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)') and not exists (select 1 from public.session_signups ss where ss.session_id = h.session_id and ss.member_id = me.id)
  ) select distinct on (boat_id) boat_id, reservation_status, expected_return_at, availability_title from reasons order by boat_id, priority;
$$;
revoke all on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) from public;
grant execute on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
