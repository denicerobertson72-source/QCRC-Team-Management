-- Rowing Club V1 seed data (safe to rerun)
-- Run after 001_schema.sql, 002_rls.sql, 003_rpc.sql

-- 1) Seed a starter boat inventory
insert into public.boats (name, boat_class_id, boat_type, required_clearance, status, rigging_notes)
values
  ('Training Single 1', '1x', 'training', 1, 'available', 'Club default rigger setup'),
  ('Training Double 1', '2x', 'training', 1, 'available', 'Check foot stretchers before launch'),
  ('Performance Single 1', '1x', 'performance', 3, 'available', 'Race rig profile')
on conflict (name) do nothing;

-- 2) Promote one known admin profile if present.
-- If no rows are updated, sign in once in the app and rerun this statement.
update public.profiles
set dues_ok = true,
    waiver_signed_at = coalesce(waiver_signed_at, now()),
    role = 'admin',
    status = 'active'
where lower(email) = lower('denicerobertson72@gmail.com');

-- 3) Visibility checks
select id, email, role, status, dues_ok, waiver_signed_at
from public.profiles
where lower(email) = lower('denicerobertson72@gmail.com');

select member_id, boat_class_id, clearance_level
from public.member_clearances
where member_id in (
  select id from public.profiles where lower(email) = lower('denicerobertson72@gmail.com')
)
order by boat_class_id;

select id, name, boat_class_id, required_clearance, status
from public.boats
order by name;
