-- V1.45: Convert older recurring-block batches (one row per date) into one recurring record.
-- Only rows inserted together with the same title, scope, notes, and daily time window are combined.
do $$
declare
  series record;
begin
  for series in
    select
      (array_agg(id order by id))[1] as keep_id,
      array_agg(id) as block_ids,
      min((starts_at at time zone 'America/New_York')::date) as start_date,
      max((ends_at at time zone 'America/New_York')::date) as end_date,
      array_agg(distinct extract(dow from starts_at at time zone 'America/New_York')::smallint order by extract(dow from starts_at at time zone 'America/New_York')::smallint) as weekdays,
      (min(starts_at) at time zone 'America/New_York')::time as start_time,
      (min(ends_at) at time zone 'America/New_York')::time as end_time
    from public.boat_availability_blocks
    where recurrence_start_date is null
      and ends_at >= now()
    group by
      created_by, title, applies_to_membership_type, applies_to_boat_class_id, is_active, notes, created_at,
      (starts_at at time zone 'America/New_York')::time,
      (ends_at at time zone 'America/New_York')::time
    having count(*) > 1
  loop
    update public.boat_availability_blocks
    set recurrence_start_date = series.start_date,
        recurrence_end_date = series.end_date,
        recurrence_weekdays = series.weekdays,
        daily_start_time = series.start_time,
        daily_end_time = series.end_time
    where id = series.keep_id;

    delete from public.boat_availability_blocks
    where id = any(series.block_ids)
      and id <> series.keep_id;
  end loop;
end;
$$;
