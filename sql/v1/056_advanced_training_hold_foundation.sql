-- V1.56: dormant foundation for program priority fleets and per-session training holds.
create table if not exists public.program_priority_boats (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('coached_training_advanced', 'coached_training_beginner_intermediate')),
  boat_id uuid not null references public.boats(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_type, boat_id)
);
create index if not exists program_priority_boats_type_idx on public.program_priority_boats(session_type);
create index if not exists program_priority_boats_boat_idx on public.program_priority_boats(boat_id);

create table if not exists public.training_boat_holds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  boat_id uuid not null references public.boats(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'Coached training priority',
  auto_generated boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (session_id, boat_id)
);
create index if not exists training_boat_holds_session_idx on public.training_boat_holds(session_id);
create index if not exists training_boat_holds_boat_time_idx on public.training_boat_holds(boat_id, starts_at, ends_at);

alter table public.program_priority_boats enable row level security;
alter table public.training_boat_holds enable row level security;
drop policy if exists program_priority_boats_read on public.program_priority_boats;
drop policy if exists program_priority_boats_manage on public.program_priority_boats;
drop policy if exists training_boat_holds_read on public.training_boat_holds;
drop policy if exists training_boat_holds_manage on public.training_boat_holds;
create policy program_priority_boats_read on public.program_priority_boats for select using (auth.role() = 'authenticated');
create policy program_priority_boats_manage on public.program_priority_boats for all using (public.can_manage_club_data()) with check (public.can_manage_club_data());
create policy training_boat_holds_read on public.training_boat_holds for select using (auth.role() = 'authenticated');
create policy training_boat_holds_manage on public.training_boat_holds for all using (public.can_manage_club_data()) with check (public.can_manage_club_data());

-- Idempotently create/update priority holds for one future Advanced Training session.
create or replace function public.sync_advanced_training_holds(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_session record;
begin
  if not public.can_manage_club_data() then raise exception 'Admin permissions required'; end if;
  select id, starts_at, ends_at, session_type, is_cancelled into v_session from public.sessions where id = p_session_id;
  if v_session.id is null or v_session.session_type <> 'coached_training_advanced' or v_session.is_cancelled or v_session.ends_at <= now() then return; end if;
  insert into public.training_boat_holds (session_id, boat_id, starts_at, ends_at)
  select v_session.id, ppb.boat_id, v_session.starts_at, v_session.ends_at
  from public.program_priority_boats ppb join public.boats b on b.id = ppb.boat_id
  where ppb.session_type = 'coached_training_advanced' and b.status <> 'locked'
  on conflict (session_id, boat_id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, reason = excluded.reason
  where public.training_boat_holds.auto_generated;
end;
$$;

-- Idempotently synchronize all future Advanced Training sessions; no triggers call this in Phase 1A.
create or replace function public.sync_future_advanced_training_holds()
returns void language plpgsql security definer set search_path = public as $$
declare v_session record;
begin
  if not public.can_manage_club_data() then raise exception 'Admin permissions required'; end if;
  for v_session in select id from public.sessions where session_type = 'coached_training_advanced' and is_cancelled = false and ends_at > now() loop
    perform public.sync_advanced_training_holds(v_session.id);
  end loop;
end;
$$;

create or replace function public.training_hold_reservation_conflicts(p_session_id uuid)
returns table(hold_id uuid, session_id uuid, boat_id uuid, boat_name text, reservation_id uuid, member_id uuid, reservation_start timestamptz, reservation_end timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, h.session_id, h.boat_id, b.name, r.id, r.created_by, r.start_time, r.end_time
  from public.training_boat_holds h join public.boats b on b.id = h.boat_id
  join public.reservations r on r.boat_id = h.boat_id and r.status in ('reserved','checked_out')
    and tstzrange(r.start_time,r.end_time,'[)') && tstzrange(h.starts_at,h.ends_at,'[)')
  where h.session_id = p_session_id;
$$;
grant execute on function public.sync_advanced_training_holds(uuid) to authenticated;
grant execute on function public.sync_future_advanced_training_holds() to authenticated;
grant execute on function public.training_hold_reservation_conflicts(uuid) to authenticated;
