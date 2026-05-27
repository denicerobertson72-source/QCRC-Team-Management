alter table public.profiles
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists sms_opt_in_at timestamptz;

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
      or new.dues_renewal_date is distinct from old.dues_renewal_date
      or new.dues_last_paid_at is distinct from old.dues_last_paid_at
      or new.owns_private_boat <> old.owns_private_boat
      or new.boat_storage_fee_ok <> old.boat_storage_fee_ok
      or new.boat_storage_fee_renewal_date is distinct from old.boat_storage_fee_renewal_date
      or new.boat_storage_fee_last_paid_at is distinct from old.boat_storage_fee_last_paid_at
      or new.sms_opt_in <> old.sms_opt_in
      or new.sms_opt_in_at is distinct from old.sms_opt_in_at
      or new.coach_id is distinct from old.coach_id
      or new.membership_type <> old.membership_type then
      raise exception 'Only admin can update role/status/dues/private-boat/storage/sms/coach/membership fields';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this profile';
end;
$$;
