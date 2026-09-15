-- V1.64: record marina gate status even when a member did not take an outing.
create table if not exists public.marina_gate_status_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete restrict,
  gate_status text not null check (gate_status in ('locked', 'unlocked')),
  recorded_at timestamptz not null default now()
);

create index if not exists marina_gate_status_reports_recorded_at_idx
  on public.marina_gate_status_reports(recorded_at desc);

alter table public.marina_gate_status_reports enable row level security;

drop policy if exists marina_gate_status_reports_read on public.marina_gate_status_reports;
create policy marina_gate_status_reports_read
on public.marina_gate_status_reports
for select
using (member_id = auth.uid() or public.can_manage_club_data());

drop policy if exists marina_gate_status_reports_insert on public.marina_gate_status_reports;
create policy marina_gate_status_reports_insert
on public.marina_gate_status_reports
for insert
with check (member_id = auth.uid() or public.can_manage_club_data());
