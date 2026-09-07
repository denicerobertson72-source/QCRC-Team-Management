-- V1.48: Move future active Saturday Coached Row sessions to 7:30 AM Eastern.
-- Keep historical and cancelled sessions untouched. PostgreSQL evaluates both values
-- from the original row, so the local session date is preserved for each update.
UPDATE public.sessions
SET
  starts_at = (
    ((starts_at AT TIME ZONE 'America/New_York')::date + TIME '07:30')
    AT TIME ZONE 'America/New_York'
  ),
  ends_at = (
    ((starts_at AT TIME ZONE 'America/New_York')::date + TIME '09:00')
    AT TIME ZONE 'America/New_York'
  )
WHERE session_type = 'saturday_coached_row'
  AND starts_at >= NOW()
  AND is_cancelled = FALSE
  -- Do not overwrite individually rescheduled Saturday rows.
  AND (starts_at AT TIME ZONE 'America/New_York')::time = TIME '08:00'
  AND (ends_at AT TIME ZONE 'America/New_York')::time = TIME '09:30';
