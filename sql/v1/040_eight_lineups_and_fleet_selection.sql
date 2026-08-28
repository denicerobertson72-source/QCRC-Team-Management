-- V1.40: add the club Octuple class and allow eight-seat lineup boats.
alter table public.boat_classes drop constraint if exists boat_classes_seats_check;
alter table public.boat_classes add constraint boat_classes_seats_check check (seats in (1, 2, 4, 8));
insert into public.boat_classes (id, name, seats) values ('8x', 'Octuple', 8) on conflict (id) do update set name = excluded.name, seats = excluded.seats;

alter table public.lineup_seats drop constraint if exists lineup_seats_seat_number_check;
alter table public.lineup_seats add constraint lineup_seats_seat_number_check check (seat_number between 1 and 8);

alter table public.lineup_boats add column if not exists fleet_boat_id uuid references public.boats(id) on delete set null;
update public.lineup_boats lb
set fleet_boat_id = b.id
from public.boats b
where lb.fleet_boat_id is null and lb.boat_name = b.name;
