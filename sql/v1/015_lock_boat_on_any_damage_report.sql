create or replace function public.fn_damage_autolock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.locked_boat := true;
  update public.boats
  set status = 'locked'
  where id = new.boat_id;

  return new;
end;
$$;
