-- V1.11: optional damage photo uploads via Supabase Storage

insert into storage.buckets (id, name, public)
values ('damage-photos', 'damage-photos', false)
on conflict (id) do nothing;

drop policy if exists "damage_photos_bucket_read_authenticated" on storage.objects;
create policy "damage_photos_bucket_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'damage-photos');

drop policy if exists "damage_photos_bucket_insert_authenticated" on storage.objects;
create policy "damage_photos_bucket_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'damage-photos');

drop policy if exists "damage_photos_bucket_update_authenticated" on storage.objects;
create policy "damage_photos_bucket_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'damage-photos')
with check (bucket_id = 'damage-photos');

drop policy if exists "damage_photos_bucket_delete_authenticated" on storage.objects;
create policy "damage_photos_bucket_delete_authenticated"
on storage.objects
for delete
to authenticated
using (bucket_id = 'damage-photos');
