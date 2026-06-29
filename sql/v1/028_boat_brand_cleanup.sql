-- V1.28: stop defaulting boats to generic category labels and treat boat_type as brand

alter table public.boats
  alter column boat_type drop not null,
  alter column boat_type drop default;

update public.boats
set boat_type = null
where lower(coalesce(boat_type, '')) in ('training', 'performance', 'stable', 'race');
