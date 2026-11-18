-- Row Level Security. The Next.js server uses the service-role key (bypasses RLS) AFTER performing its own
-- authorisation checks; these policies protect every direct client access with the anon/authenticated keys.
alter table profiles enable row level security;
alter table restaurants enable row level security;
alter table restaurant_staff enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table delivery_areas enable row level security;
alter table addresses enable row level security;
alter table orders enable row level security;
alter table memberships enable row level security;
alter table promotions enable row level security;
alter table platform_settings enable row level security;
alter table stripe_events enable row level security;
alter table transactions enable row level security;
alter table notifications enable row level security;
alter table support_tickets enable row level security;

create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not suspended) $$;
create function is_staff_of(rid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from restaurant_staff where restaurant_id = rid and user_id = auth.uid()) $$;

-- profiles: read own; users may update only harmless columns (enforced by trigger below); admins read all
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create function protect_profile_columns() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_admin() and (new.role <> old.role or new.suspended <> old.suspended or new.email <> old.email) then
    raise exception 'role, suspended and email cannot be changed by the user';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles for each row execute function protect_profile_columns();

-- restaurants: public sees approved only; staff see/edit own (but never status/stripe/featured); admin all
create policy restaurants_public on restaurants for select using (status = 'approved' or is_staff_of(id) or is_admin());
create policy restaurants_staff_update on restaurants for update using (is_staff_of(id)) with check (is_staff_of(id));
create policy restaurants_admin on restaurants for all using (is_admin()) with check (is_admin());
create function protect_restaurant_columns() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_admin() and (new.status <> old.status or new.featured <> old.featured or new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_charges_enabled <> old.stripe_charges_enabled or new.stripe_payouts_enabled <> old.stripe_payouts_enabled or new.owner_id <> old.owner_id) then
    raise exception 'protected restaurant columns can only be changed by BD Feast';
  end if;
  return new;
end $$;
create trigger restaurants_protect before update on restaurants for each row execute function protect_restaurant_columns();

create policy staff_read on restaurant_staff for select using (user_id = auth.uid() or is_staff_of(restaurant_id) or is_admin());

-- menu + delivery areas: public read for approved restaurants; staff write own
create policy cats_read on menu_categories for select using (exists (select 1 from restaurants r where r.id = restaurant_id and (r.status = 'approved' or is_staff_of(r.id))) or is_admin());
create policy cats_write on menu_categories for all using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));
create policy items_read on menu_items for select using (exists (select 1 from restaurants r where r.id = restaurant_id and (r.status = 'approved' or is_staff_of(r.id))) or is_admin());
create policy items_write on menu_items for all using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));
create policy areas_read on delivery_areas for select using (exists (select 1 from restaurants r where r.id = restaurant_id and (r.status = 'approved' or is_staff_of(r.id))) or is_admin());
create policy areas_write on delivery_areas for all using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy addr_own on addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders: customers read own; staff read their restaurant's PAID orders; NO client writes (payment state is server/webhook only)
create policy orders_customer_read on orders for select using (customer_id = auth.uid());
create policy orders_staff_read on orders for select using (is_staff_of(restaurant_id) and payment_status <> 'unpaid');
create policy orders_admin_read on orders for select using (is_admin());

create policy memberships_own_read on memberships for select using (user_id = auth.uid() or is_admin());
create policy promotions_admin on promotions for all using (is_admin()) with check (is_admin());
create policy settings_read on platform_settings for select using (true);   -- public: prices/benefits are shown to everyone
create policy settings_admin on platform_settings for update using (is_admin()) with check (is_admin());
create policy tx_staff_read on transactions for select using ((restaurant_id is not null and is_staff_of(restaurant_id)) or is_admin());
create policy notifications_admin on notifications for select using (is_admin());
create policy support_own on support_tickets for select using (user_id = auth.uid() or is_admin());
-- stripe_events: no policies => inaccessible to clients; service role only.

-- Storage bucket for menu images (public read, writes only through the server upload route using the service role)
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true) on conflict do nothing;
