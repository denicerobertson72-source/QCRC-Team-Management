-- Historical boat-storage-fee columns remain intact; QCRC no longer uses or
-- enforces them.  Private boat outings still require an active private owner.
drop policy if exists private_boat_outings_insert on public.private_boat_outings;
create policy private_boat_outings_insert
on public.private_boat_outings
for insert
with check (
  member_id = auth.uid()
  and status = 'checked_out'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.owns_private_boat = true
  )
  and not exists (
    select 1 from public.private_boat_outings existing
    where existing.member_id = auth.uid()
      and existing.status = 'checked_out'
  )
);
