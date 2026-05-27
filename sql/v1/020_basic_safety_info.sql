-- V1.20: basic safety info library with uploaded assets or external links

create table if not exists public.safety_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  resource_type text not null check (resource_type in ('photo', 'procedure', 'quiz')),
  external_url text,
  storage_path text,
  mime_type text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (external_url is not null or storage_path is not null)
);

create index if not exists safety_resources_sort_idx on public.safety_resources(sort_order, created_at);
create index if not exists safety_resources_published_idx on public.safety_resources(is_published);

drop trigger if exists trg_safety_resources_updated_at on public.safety_resources;
create trigger trg_safety_resources_updated_at
before update on public.safety_resources
for each row execute function public.fn_set_updated_at();

alter table public.safety_resources enable row level security;

drop policy if exists safety_resources_read_all on public.safety_resources;
create policy safety_resources_read_all
on public.safety_resources
for select
using (auth.role() = 'authenticated');

drop policy if exists safety_resources_manage on public.safety_resources;
create policy safety_resources_manage
on public.safety_resources
for all
using (public.can_manage_club_data())
with check (public.can_manage_club_data());

insert into storage.buckets (id, name, public)
values ('safety-resources', 'safety-resources', false)
on conflict (id) do nothing;

drop policy if exists "safety_resources_bucket_read_authenticated" on storage.objects;
create policy "safety_resources_bucket_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'safety-resources');

drop policy if exists "safety_resources_bucket_insert_authenticated" on storage.objects;
create policy "safety_resources_bucket_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'safety-resources');

drop policy if exists "safety_resources_bucket_update_authenticated" on storage.objects;
create policy "safety_resources_bucket_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'safety-resources')
with check (bucket_id = 'safety-resources');

drop policy if exists "safety_resources_bucket_delete_authenticated" on storage.objects;
create policy "safety_resources_bucket_delete_authenticated"
on storage.objects
for delete
to authenticated
using (bucket_id = 'safety-resources');
