-- V1.44: explain whether a boat is unavailable because of another outing or a club block.
drop function if exists public.unavailable_boats_for_window(timestamptz, timestamptz, text);

create or replace function public.unavailable_boats_for_window(p_start_time timestamptz, p_end_time timestamptz, p_boat_class_id text default null)
returns table(boat_id uuid, reservation_status text, expected_return_at timestamptz, availability_title text)
language sql stable security definer set search_path = public as $$
  with me as (select p.skill_level, p.weight_class, p.membership_type from public.profiles p where p.id = auth.uid() and p.status = 'active'), eligible_boats as (select b.id from public.boats b join me on true where b.status='available' and public.skill_level_to_clearance(me.skill_level)>=b.required_clearance and public.skill_level_rank(me.skill_level)>=public.skill_level_rank(b.required_skill_level) and (b.weight_class is null or public.weight_class_rank(b.weight_class)>=public.weight_class_rank(me.weight_class)) and (p_boat_class_id is null or b.boat_class_id=p_boat_class_id))
  select r.boat_id, r.status, r.end_time, null::text from public.reservations r join eligible_boats b on b.id=r.boat_id where r.status in ('reserved','checked_out') and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')
  union all
  select b.id, 'availability_block'::text, null::timestamptz, blk.title from eligible_boats b join public.boats boat on boat.id=b.id join me on true join public.boat_availability_blocks blk on blk.is_active and public.availability_block_overlaps(blk,p_start_time,p_end_time) and (blk.applies_to_membership_type is null or blk.applies_to_membership_type=me.membership_type) and (blk.applies_to_boat_class_id is null or blk.applies_to_boat_class_id=boat.boat_class_id);
$$;

revoke all on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) from public;
grant execute on function public.unavailable_boats_for_window(timestamptz, timestamptz, text) to authenticated;
