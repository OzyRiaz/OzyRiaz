-- 0009: internal "founding partner" record for restaurants (the first restaurants promised no joining fee).
-- Additive and safe to re-run. Changes nothing about orders, fees or payouts; not shown to customers.
alter table public.restaurants
  add column if not exists founding_partner boolean not null default false,
  add column if not exists founding_partner_since timestamptz;

-- Restaurant owners must not be able to flag themselves: add the new columns to the protected set.
create or replace function public.protect_restaurant_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and (new.status <> old.status or new.featured <> old.featured or new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_charges_enabled <> old.stripe_charges_enabled or new.stripe_payouts_enabled <> old.stripe_payouts_enabled or new.owner_id <> old.owner_id
     or new.founding_partner <> old.founding_partner or new.founding_partner_since is distinct from old.founding_partner_since) then
    raise exception 'protected restaurant columns can only be changed by FeastQuarter';
  end if;
  return new;
end $$;
