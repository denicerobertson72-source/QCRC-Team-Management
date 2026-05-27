-- Rowing Club V1 RLS + authorization helpers

-- ---------- Auth helper functions ----------
create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin');
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('coach');
$$;

create or replace function public.is_equipment_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('equipment_manager');
$$;

create or replace function public.can_manage_club_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_equipment_manager() or public.is_coach();
$$;

create or replace function public.is_member_in_reservation(p_reservation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations r
    where r.id = p_reservation_id
      and (
        r.created_by = p_user_id
        or exists (
          select 1
          from public.reservation_crew rc
          where rc.reservation_id = r.id
            and rc.member_id = p_user_id
        )
      )
  );
$$;

create or replace function public.can_user_reserve_boat(
  p_user_id uuid,
  p_boat_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with profile_cte as (
    select p.*
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and p.dues_ok = true
      and p.waiver_signed_at is not null
  ),
  boat_cte as (
    select b.*
    from public.boats b
    where b.id = p_boat_id
      and b.status = 'available'
  ),
  eligibility_cte as (
    select
      greatest(mc.clearance_level, public.skill_level_to_clearance(p.skill_level)) as effective_clearance,
      b.required_clearance
    from profile_cte p
    join boat_cte b on true
    join public.member_clearances mc
      on mc.member_id = p.id
     and mc.boat_class_id = b.boat_class_id
  )
  select
    p_end_time > p_start_time
    and exists(select 1 from profile_cte)
    and exists(select 1 from boat_cte)
    and exists(
      select 1
      from eligibility_cte c
      where c.effective_clearance >= c.required_clearance
    )
    and exists(
      select 1
      from profile_cte p
      join boat_cte b on true
      where public.skill_level_rank(p.skill_level) >= public.skill_level_rank(b.required_skill_level)
        and (b.weight_class is null or b.weight_class = p.weight_class)
    );
$$;

-- Prevent privilege/status escalation by self-service profile updates.
create or replace function public.fn_guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if old.id = auth.uid() then
    if new.role <> old.role
      or new.status <> old.status
      or new.dues_ok <> old.dues_ok
      or new.coach_id is distinct from old.coach_id
      or new.membership_type <> old.membership_type then
      raise exception 'Only admin can update role/status/dues/coach/membership fields';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this profile';
end;
$$;

drop trigger if exists trg_guard_profile_self_update on public.profiles;
create trigger trg_guard_profile_self_update
before update on public.profiles
for each row execute function public.fn_guard_profile_self_update();

-- ---------- Enable RLS ----------
alter table public.profiles enable row level security;
alter table public.boat_classes enable row level security;
alter table public.member_clearances enable row level security;
alter table public.boats enable row level security;
alter table public.maintenance_logs enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_crew enable row level security;
alter table public.damage_reports enable row level security;
alter table public.damage_photos enable row level security;
alter table public.sessions enable row level security;
alter table public.session_signups enable row level security;

-- ---------- Profiles ----------
drop policy if exists profiles_read_policy on public.profiles;
create policy profiles_read_policy
on public.profiles
for select
using (
  id = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
with check (
  id = auth.uid()
  or public.is_admin()
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update
using (
  id = auth.uid()
  or public.is_admin()
)
with check (
  id = auth.uid()
  or public.is_admin()
);

-- ---------- Boat classes ----------
drop policy if exists boat_classes_read_all on public.boat_classes;
create policy boat_classes_read_all
on public.boat_classes
for select
using (auth.role() = 'authenticated');

drop policy if exists boat_classes_admin_manage on public.boat_classes;
create policy boat_classes_admin_manage
on public.boat_classes
for all
using (public.is_admin())
with check (public.is_admin());

-- ---------- Member clearances ----------
drop policy if exists member_clearances_read on public.member_clearances;
create policy member_clearances_read
on public.member_clearances
for select
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists member_clearances_manage on public.member_clearances;
create policy member_clearances_manage
on public.member_clearances
for all
using (
  public.is_admin() or public.is_coach()
)
with check (
  public.is_admin() or public.is_coach()
);

-- ---------- Boats ----------
drop policy if exists boats_read_all on public.boats;
create policy boats_read_all
on public.boats
for select
using (auth.role() = 'authenticated');

drop policy if exists boats_manage_equipment_admin on public.boats;
create policy boats_manage_equipment_admin
on public.boats
for all
using (
  public.is_admin() or public.is_equipment_manager()
)
with check (
  public.is_admin() or public.is_equipment_manager()
);

-- ---------- Maintenance logs ----------
drop policy if exists maintenance_logs_read on public.maintenance_logs;
create policy maintenance_logs_read
on public.maintenance_logs
for select
using (auth.role() = 'authenticated');

drop policy if exists maintenance_logs_manage on public.maintenance_logs;
create policy maintenance_logs_manage
on public.maintenance_logs
for all
using (
  public.is_admin() or public.is_equipment_manager()
)
with check (
  public.is_admin() or public.is_equipment_manager()
);

-- ---------- Reservations ----------
drop policy if exists reservations_read on public.reservations;
create policy reservations_read
on public.reservations
for select
using (
  created_by = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert
on public.reservations
for insert
with check (
  created_by = auth.uid()
  and public.can_user_reserve_boat(created_by, boat_id, start_time, end_time)
);

-- Owner can only cancel future, not-yet-checked-out reservations.
drop policy if exists reservations_update_owner_cancel on public.reservations;
create policy reservations_update_owner_cancel
on public.reservations
for update
using (
  created_by = auth.uid()
  and status = 'reserved'
  and checked_out_at is null
  and start_time > now()
)
with check (
  created_by = auth.uid()
  and (
    status = 'cancelled'
    or (
      status = 'reserved'
      and checked_out_at is null
      and checked_in_at is null
      and public.can_user_reserve_boat(created_by, boat_id, start_time, end_time)
    )
  )
);

drop policy if exists reservations_update_managers on public.reservations;
create policy reservations_update_managers
on public.reservations
for update
using (public.can_manage_club_data())
with check (public.can_manage_club_data());

-- No delete policy on reservations (audit trail stays permanent).

-- ---------- Reservation crew ----------
drop policy if exists reservation_crew_read on public.reservation_crew;
create policy reservation_crew_read
on public.reservation_crew
for select
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
  or exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and r.created_by = auth.uid()
  )
);

drop policy if exists reservation_crew_manage on public.reservation_crew;
create policy reservation_crew_manage
on public.reservation_crew
for all
using (
  public.can_manage_club_data()
  or exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and r.created_by = auth.uid()
      and r.status = 'reserved'
      and r.checked_out_at is null
  )
)
with check (
  public.can_manage_club_data()
  or exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and r.created_by = auth.uid()
      and r.status = 'reserved'
      and r.checked_out_at is null
  )
);

-- ---------- Damage reports ----------
drop policy if exists damage_reports_read on public.damage_reports;
create policy damage_reports_read
on public.damage_reports
for select
using (
  reported_by = auth.uid()
  or public.can_manage_club_data()
  or (
    reservation_id is not null
    and public.is_member_in_reservation(reservation_id, auth.uid())
  )
);

drop policy if exists damage_reports_insert on public.damage_reports;
create policy damage_reports_insert
on public.damage_reports
for insert
with check (
  reported_by = auth.uid()
  and (
    reservation_id is null
    or public.is_member_in_reservation(reservation_id, auth.uid())
  )
);

-- Immutable submission: only equipment/admin can update lifecycle fields.
drop policy if exists damage_reports_update on public.damage_reports;
create policy damage_reports_update
on public.damage_reports
for update
using (
  public.is_admin() or public.is_equipment_manager()
)
with check (
  public.is_admin() or public.is_equipment_manager()
);

-- ---------- Damage photos ----------
drop policy if exists damage_photos_read on public.damage_photos;
create policy damage_photos_read
on public.damage_photos
for select
using (
  public.can_manage_club_data()
  or exists (
    select 1
    from public.damage_reports dr
    where dr.id = damage_report_id
      and dr.reported_by = auth.uid()
  )
);

drop policy if exists damage_photos_insert on public.damage_photos;
create policy damage_photos_insert
on public.damage_photos
for insert
with check (
  uploaded_by = auth.uid()
  and (
    public.can_manage_club_data()
    or exists (
      select 1
      from public.damage_reports dr
      where dr.id = damage_report_id
        and dr.reported_by = auth.uid()
    )
  )
);

-- ---------- Sessions ----------
drop policy if exists sessions_read on public.sessions;
create policy sessions_read
on public.sessions
for select
using (auth.role() = 'authenticated');

drop policy if exists sessions_manage on public.sessions;
create policy sessions_manage
on public.sessions
for all
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

-- ---------- Session signups ----------
drop policy if exists session_signups_read on public.session_signups;
create policy session_signups_read
on public.session_signups
for select
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists session_signups_insert on public.session_signups;
create policy session_signups_insert
on public.session_signups
for insert
with check (
  member_id = auth.uid()
  or public.can_manage_club_data()
);

drop policy if exists session_signups_update_delete on public.session_signups;
create policy session_signups_update_delete
on public.session_signups
for all
using (
  member_id = auth.uid()
  or public.can_manage_club_data()
)
with check (
  member_id = auth.uid()
  or public.can_manage_club_data()
);
