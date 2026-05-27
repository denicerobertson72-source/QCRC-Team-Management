-- V1.9: Program sessions monthly calendars + cancellation state

alter table public.sessions
  add column if not exists is_cancelled boolean not null default false,
  add column if not exists cancelled_reason text;

create index if not exists sessions_program_month_idx
  on public.sessions(session_type, starts_at);

-- Optional uniqueness guard to prevent duplicate generated sessions.
-- Uses date_trunc hour granularity to avoid exact duplicate starts for same type.
create unique index if not exists sessions_unique_type_start_idx
  on public.sessions(session_type, starts_at);
