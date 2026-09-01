-- V1.42: restore availability-block checks after the lineup-priority update.
-- Expired blocks never match because their time range no longer overlaps a new reservation.
create or replace function public.available_boat_ids_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns table(id uuid) language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.skill_level, p.weight_class, p.membership_type from public.profiles p where p.id = auth.uid() and p.status = 'active')
  select b.id from public.boats b join me on true
  where b.status = 'available'
    and public.skill_level_to_clearance(me.skill_level) >= b.required_clearance
    and public.skill_level_rank(me.skill_level) >= public.skill_level_rank(b.required_skill_level)
    and (b.weight_class is null or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(me.weight_class))
    and p_end_time > p_start_time and (p_boat_class_id is null or b.boat_class_id = p_boat_class_id)
    and not public.boat_in_program_lineup_window(b.id, p_start_time, p_end_time)
    and not exists (select 1 from public.reservations r where r.boat_id = b.id and r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)'))
    and not exists (select 1 from public.reservations r where r.created_by = auth.uid() and r.status in ('reserved','checked_out') and tstzrange(r.start_time - interval '90 minutes',r.end_time + interval '90 minutes','[)') && tstzrange(p_start_time,p_end_time,'[)'))
    and not exists (select 1 from public.boat_availability_blocks blk where blk.is_active and tstzrange(blk.starts_at,blk.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)') and (blk.applies_to_membership_type is null or blk.applies_to_membership_type = me.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id = b.boat_class_id));
$$;

create or replace function public.can_user_reserve_boat(p_user_id uuid, p_boat_id uuid, p_start_time timestamptz, p_end_time timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_end_time > p_start_time and not public.boat_in_program_lineup_window(p_boat_id, p_start_time, p_end_time)
    and exists (select 1 from public.profiles p join public.boats b on b.id = p_boat_id where p.id = p_user_id and p.status = 'active' and b.status = 'available' and public.skill_level_to_clearance(p.skill_level) >= b.required_clearance and public.skill_level_rank(p.skill_level) >= public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class) >= public.weight_class_rank(p.weight_class)) and not exists (select 1 from public.boat_availability_blocks blk where blk.is_active and tstzrange(blk.starts_at,blk.ends_at,'[)') && tstzrange(p_start_time,p_end_time,'[)') and (blk.applies_to_membership_type is null or blk.applies_to_membership_type = p.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id = b.boat_class_id)));
$$;
