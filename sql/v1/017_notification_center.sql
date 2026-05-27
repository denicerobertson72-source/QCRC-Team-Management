alter table public.notification_events
  add column if not exists read_at timestamptz;

drop policy if exists notification_events_member_read on public.notification_events;
create policy notification_events_member_read
on public.notification_events
for select
using (member_id = auth.uid() or public.is_admin());

drop policy if exists notification_events_member_update on public.notification_events;
create policy notification_events_member_update
on public.notification_events
for update
using (member_id = auth.uid() or public.is_admin())
with check (member_id = auth.uid() or public.is_admin());

drop policy if exists notification_events_system_insert on public.notification_events;
create policy notification_events_system_insert
on public.notification_events
for insert
with check (member_id = auth.uid() or public.is_admin() or public.can_manage_club_data());
