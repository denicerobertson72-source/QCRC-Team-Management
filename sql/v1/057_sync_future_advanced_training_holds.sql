-- V1.57: priority-fleet changes require two-way future hold synchronization.
create or replace function public.sync_future_advanced_training_holds()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_club_data() then raise exception 'Admin permissions required'; end if;
  delete from public.training_boat_holds h
  using public.sessions s
  where h.session_id=s.id and s.session_type='coached_training_advanced' and s.is_cancelled=false and s.ends_at>now()
    and h.auto_generated and not exists (select 1 from public.program_priority_boats pp where pp.session_type='coached_training_advanced' and pp.boat_id=h.boat_id);
  perform public.sync_advanced_training_holds(s.id) from public.sessions s where s.session_type='coached_training_advanced' and s.is_cancelled=false and s.ends_at>now();
end;
$$;
