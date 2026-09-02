-- V1.46: coach-managed race postings can target members using their Admin → Members skill level.
alter table public.race_events add column if not exists eligible_skill_levels text[];
update public.race_events set eligible_skill_levels = array['LTR','Beginner','Intermediate','Advanced','Elite'] where eligible_skill_levels is null;
alter table public.race_events alter column eligible_skill_levels set not null;
alter table public.race_events drop constraint if exists race_events_eligible_skill_levels_check;
alter table public.race_events add constraint race_events_eligible_skill_levels_check check (cardinality(eligible_skill_levels) > 0 and eligible_skill_levels <@ array['LTR','Beginner','Intermediate','Advanced','Elite']::text[]);

drop policy if exists race_events_read_all on public.race_events;
create policy race_events_read_eligible_or_manage on public.race_events for select using (
  public.can_manage_club_data() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.skill_level = any(race_events.eligible_skill_levels))
);
