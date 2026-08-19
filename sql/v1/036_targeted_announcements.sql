alter table public.team_announcements
  add column if not exists audience_type text not null default 'all',
  add column if not exists audience_race_event_id uuid references public.race_events(id) on delete set null;

alter table public.team_announcements
  drop constraint if exists team_announcements_audience_type_check;
alter table public.team_announcements
  add constraint team_announcements_audience_type_check
  check (audience_type in ('all', 'training_beginner_intermediate', 'training_advanced', 'saturday_community_row', 'race', 'meetup'));

alter table public.team_announcements
  drop constraint if exists team_announcements_race_audience_check;
alter table public.team_announcements
  add constraint team_announcements_race_audience_check
  check ((audience_type = 'race') = (audience_race_event_id is not null));

create index if not exists team_announcements_audience_idx
  on public.team_announcements(audience_type, audience_race_event_id, created_at desc);

drop policy if exists team_announcements_read on public.team_announcements;
create policy team_announcements_read
on public.team_announcements
for select
using (
  public.can_manage_club_data()
  or (
    is_published = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and (
      audience_type = 'all'
      or (audience_type = 'training_beginner_intermediate' and exists (
        select 1 from public.program_signups ps where ps.member_id = auth.uid() and ps.program_type = 'coached_training' and ps.training_group = 'beginner_intermediate'
      ))
      or (audience_type = 'training_advanced' and exists (
        select 1 from public.program_signups ps where ps.member_id = auth.uid() and ps.program_type = 'coached_training' and ps.training_group = 'advanced'
      ))
      or (audience_type = 'saturday_community_row' and exists (
        select 1 from public.program_signups ps where ps.member_id = auth.uid() and ps.program_type = 'saturday_coached_row'
      ))
      or (audience_type = 'race' and exists (
        select 1 from public.race_signups rs where rs.member_id = auth.uid() and rs.race_event_id = audience_race_event_id
      ))
      or (audience_type = 'meetup' and exists (
        select 1 from public.rowing_meetup_members rm where rm.member_id = auth.uid()
      ))
    )
  )
);

drop policy if exists team_announcements_meetup_member_insert on public.team_announcements;
create policy team_announcements_meetup_member_insert
on public.team_announcements
for insert
with check (
  created_by = auth.uid()
  and audience_type = 'meetup'
  and audience_race_event_id is null
  and exists (select 1 from public.rowing_meetup_members rm where rm.member_id = auth.uid())
);
