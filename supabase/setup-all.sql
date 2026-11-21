-- FeastQuarter: complete database setup for a NEW project. Paste into Supabase > SQL Editor > New query, then Run. Run ONCE.

-- ===== 0001_schema =====
-- FeastQuarter schema. All money is integer pence (GBP). Run via `supabase db push` or the SQL editor.
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer','restaurant','admin')),
  suspended boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Profiles are created by trigger. Role is ALWAYS 'customer' here; it is never read from user-supplied metadata.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  slug text not null unique,
  name text not null,
  description text not null default '',
  cuisines text[] not null default '{}',
  address_line1 text not null,
  postcode text not null,
  city_slug text not null default 'bradford',
  phone text, email text, image_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  is_demo boolean not null default false,
  featured boolean not null default false,
  opening_hours jsonb not null default '{}',
  min_order_pence int not null default 0,
  prep_minutes int not null default 30,
  delivery_enabled boolean not null default true,
  collection_enabled boolean not null default true,
  member_offer jsonb not null default '{"enabled":false,"percent":0,"min_spend_pence":1500,"description":""}',
  stripe_account_id text unique,
  stripe_details_submitted boolean not null default false,
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table restaurant_staff (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null, sort int not null default 0,
  created_at timestamptz not null default now()
);
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references menu_categories(id) on delete cascade,
  name text not null, description text not null default '',
  price_pence int not null check (price_pence >= 0),
  image_url text,
  available boolean not null default true,
  allergens text[] not null default '{}',
  allergen_info_confirmed boolean not null default false,
  dietary text[] not null default '{}',
  option_groups jsonb not null default '[]',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table delivery_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  postcode_prefixes text[] not null default '{}',
  fee_pence int not null check (fee_pence >= 0),
  min_order_pence int,
  created_at timestamptz not null default now()
);
create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null, line1 text not null, line2 text, city text not null, postcode text not null,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references profiles(id),
  restaurant_id uuid not null references restaurants(id),
  idempotency_key text not null unique,            -- blocks duplicate orders
  fulfilment text not null check (fulfilment in ('delivery','collection')),
  status text not null default 'pending_payment',
  payment_status text not null default 'unpaid',
  lines jsonb not null,
  subtotal_pence int not null, delivery_fee_pence int not null default 0,
  discount_pence int not null default 0, discount_label text,
  discount_funded_by_restaurant_pence int not null default 0, discount_funded_by_platform_pence int not null default 0,
  promo_code text,
  total_pence int not null check (total_pence >= 0),
  commission_bps int not null, commission_pence int not null,
  application_fee_pence int not null check (application_fee_pence >= 0),
  restaurant_net_pence int not null,
  delivery_address jsonb, customer_note text, contact_phone text,
  stripe_session_id text, stripe_payment_intent_id text,
  rejection_reason text,
  refunded_pence int not null default 0,
  history jsonb not null default '[]',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on orders (restaurant_id, created_at desc);
create index on orders (customer_id, created_at desc);
create index on orders (stripe_payment_intent_id);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  status text not null default 'incomplete' check (status in ('incomplete','active','past_due','cancelled')),
  stripe_customer_id text, stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now()
);
create index on memberships (stripe_customer_id);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, description text not null default '',
  kind text not null check (kind in ('percent','fixed')),
  value int not null check (value > 0),
  min_spend_pence int not null default 0,
  active boolean not null default true,
  starts_at timestamptz, ends_at timestamptz,
  max_uses int, used_count int not null default 0,
  funded_by text not null default 'platform' check (funded_by in ('platform','restaurant')),
  restaurant_id uuid references restaurants(id),
  created_at timestamptz not null default now()
);

create table platform_settings (
  id text primary key default 'main' check (id = 'main'),
  commission_delivery_bps int not null default 800,
  commission_collection_bps int not null default 500,
  membership_price_pence int not null default 499,
  membership_benefits text[] not null default '{}',
  member_discount_funding text not null default 'restaurant' check (member_discount_funding in ('restaurant','platform')),
  member_discount_max_percent int not null default 20
);
insert into platform_settings (membership_benefits) values (array[
  'Access to member-only discounts at participating restaurants',
  'Exclusive offers set by restaurants and FeastQuarter',
  'Cancel any time — no minimum term']);

create table stripe_events (id text primary key, type text not null, received_at timestamptz not null default now()); -- webhook idempotency
create table transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null, order_id uuid references orders(id), user_id uuid, restaurant_id uuid,
  amount_pence int not null, status text not null, stripe_ref text, note text,
  created_at timestamptz not null default now()
);
create index on transactions (kind, created_at desc);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null, to_email text not null, subject text not null, body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  detail text, created_at timestamptz not null default now()
);
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, email text not null, subject text not null, message text not null,
  status text not null default 'open', created_at timestamptz not null default now()
);

-- ===== 0002_rls =====
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
    raise exception 'protected restaurant columns can only be changed by FeastQuarter';
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

-- ===== 0003_rebrand =====
-- Rebrand BD Feast -> FeastQuarter. DATA-ONLY and idempotent: no tables, columns, policies or ids are renamed.
-- Safe to run on an existing database; safe to run twice. (Only text stored in settings rows changes.)
update platform_settings
set membership_benefits = coalesce((
  select array_agg(replace(replace(b, 'BD Feast Plus', 'FeastQuarter Plus'), 'BD Feast', 'FeastQuarter') order by ord)
  from unnest(membership_benefits) with ordinality as t(b, ord)
), '{}')
where id = 'main';
-- Existing orders keep their historic references (BDF-XXXXXX); new orders use FQ-XXXXXX. Both are unique and valid.

-- ===== 0004_launch_model =====
-- FeastQuarter launch financial model + operations. ADDITIVE and idempotent: no drops, no renames, no data deleted.
-- Existing orders keep the commission_bps they were placed at (historical rates are never rewritten).

-- 1) Flat commission, VAT configuration, feature flag --------------------------------------------------
alter table platform_settings
  add column if not exists commission_bps int not null default 1000 check (commission_bps between 0 and 3000),
  add column if not exists platform_vat_registered boolean not null default false,
  add column if not exists vat_threshold_pence bigint not null default 9000000,
  add column if not exists vat_rate_bps int not null default 2000,
  add column if not exists commission_vat_mode text not null default 'none' check (commission_vat_mode in ('none','inclusive','exclusive')),
  add column if not exists feature_plus_enabled boolean not null default false;
-- Launch terms: flat 10% for delivery AND collection. Legacy columns are kept (deprecated) and aligned.
update platform_settings set commission_bps = 1000, commission_delivery_bps = 1000, commission_collection_bps = 1000 where id = 'main';

-- 2) Orders: tips, VAT on commission, ACTUAL Stripe fee, operations, attribution --------------------------
alter table orders
  add column if not exists tip_pence int not null default 0 check (tip_pence >= 0),
  add column if not exists commission_vat_pence int not null default 0,
  add column if not exists stripe_fee_pence int,
  add column if not exists ready_in_minutes int,
  add column if not exists accepted_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists source text,
  add column if not exists campaign text;

-- 3) Restaurants: online/offline, legal + food-safety + own VAT status, referral ---------------------------
alter table restaurants
  add column if not exists accepting_orders boolean not null default true,
  add column if not exists legal_name text,
  add column if not exists company_number text,
  add column if not exists vat_registered boolean not null default false,
  add column if not exists vat_number text,
  add column if not exists food_business_reg text,
  add column if not exists food_hygiene_rating int check (food_hygiene_rating between 0 and 5),
  add column if not exists food_hygiene_authority text,
  add column if not exists referred_by text;

-- 4) Audit + cost ledgers --------------------------------------------------------------------------------
create table if not exists settings_audit (
  id uuid primary key default gen_random_uuid(),
  changed_by uuid not null,
  field text not null, old_value text, new_value text, reason text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists platform_expenses (   -- Stripe Connect account/payout fees etc. (not per-charge)
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stripe_connect_account','stripe_payout','stripe_other','other')),
  amount_pence int not null check (amount_pence > 0),
  incurred_on timestamptz not null, note text not null default '',
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists settings_audit_created on settings_audit (created_at desc);
alter table settings_audit enable row level security;
alter table platform_expenses enable row level security;
drop policy if exists settings_audit_admin on settings_audit;
create policy settings_audit_admin on settings_audit for select using (is_admin());
drop policy if exists expenses_admin on platform_expenses;
create policy expenses_admin on platform_expenses for select using (is_admin());
-- (writes happen only through the server with the service-role key, after an admin check)

-- ===== 0005_payouts =====
-- Restaurant payout records, written ONLY from signature-verified Stripe payout.* webhook events (service role).
create table if not exists restaurant_payouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  stripe_payout_id text not null unique,
  amount_pence int not null,
  status text not null check (status in ('pending','in_transit','paid','failed','canceled')),
  arrival_date timestamptz, failure_message text,
  created_at timestamptz not null default now()
);
create index if not exists restaurant_payouts_rest on restaurant_payouts (restaurant_id, created_at desc);
alter table restaurant_payouts enable row level security;
drop policy if exists payouts_staff_read on restaurant_payouts;
create policy payouts_staff_read on restaurant_payouts for select using (is_staff_of(restaurant_id) or is_admin());

-- ===== 0006_cities_marketing_support =====
-- Multi-city configuration, city-scoped promotions, refund-request linkage, courier booking records (all disabled at launch).
create table if not exists cities (
  slug text primary key,
  name text not null,
  areas text[] not null default '{}',          -- postcode areas, e.g. {BD}, {LS}, {M}
  active boolean not null default false,       -- only active cities accept orders
  created_at timestamptz not null default now()
);
insert into cities (slug, name, areas, active) values
  ('bradford', 'Bradford', '{BD}', true),
  ('leeds', 'Leeds', '{LS}', false),
  ('manchester', 'Manchester', '{M}', false)
on conflict (slug) do nothing;
alter table cities enable row level security;
drop policy if exists cities_public_read on cities;
create policy cities_public_read on cities for select using (true);   -- city names/areas are public information

alter table promotions add column if not exists city_slug text references cities(slug);
alter table support_tickets add column if not exists order_id uuid references orders(id);
alter table support_tickets add column if not exists kind text not null default 'general';

-- Future courier bookings. NOTHING writes here at launch: all courier providers are disabled in code.
create table if not exists delivery_bookings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  provider text not null,
  provider_ref text, status text not null default 'quoted',
  quoted_cost_pence int, actual_cost_pence int, subsidy_pence int not null default 0,
  estimated_pickup_at timestamptz, tracking_url text, failure_reason text,
  created_at timestamptz not null default now()
);
alter table delivery_bookings enable row level security;
drop policy if exists bookings_admin on delivery_bookings;
create policy bookings_admin on delivery_bookings for select using (is_admin());

-- ===== 0007_service_fee_refunds =====
-- 0007: FeastQuarter customer service fee (99p, fixed) + exact refund accounting.
-- Safe to re-run. Does NOT touch historical orders: they keep the fee/commission they were charged at the time.

alter table public.platform_settings
  add column if not exists customer_service_fee_pence int not null default 99,
  add column if not exists service_fee_vat_mode text not null default 'none',
  add column if not exists service_fee_refund_on_customer_cancel boolean not null default true;

alter table public.orders
  add column if not exists service_fee_pence int not null default 0,
  add column if not exists service_fee_vat_pence int not null default 0,
  add column if not exists refunded_food_pence int not null default 0,
  add column if not exists refunded_delivery_pence int not null default 0,
  add column if not exists refunded_tip_pence int not null default 0,
  add column if not exists refunded_service_fee_pence int not null default 0,
  add column if not exists commission_refunded_pence int not null default 0,
  add column if not exists restaurant_refunded_pence int not null default 0,
  add column if not exists stripe_transfer_id text;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('full','partial','service_fee','declined','customer_cancel','timeout','external')),
  amount_pence int not null,
  food_pence int not null default 0,
  delivery_pence int not null default 0,
  tip_pence int not null default 0,
  service_fee_pence int not null default 0,
  commission_returned_pence int not null default 0,
  restaurant_share_pence int not null default 0,
  platform_share_pence int not null default 0,
  reason text not null default '',
  actor_id uuid,
  stripe_refund_id text,
  stripe_reversal_id text,
  reversal_error text,
  created_at timestamptz not null default now()
);
create index if not exists order_refunds_order_idx on public.order_refunds(order_id);

alter table public.order_refunds enable row level security;
-- Server (service role) only. Customers see refunds through their order page, which is rendered server-side.

-- ===== 0008_security_hardening =====
-- 0008: security hardening found by the Supabase security advisor. Safe to re-run. No data is touched.
-- Trigger functions never need to be callable through the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- Fix the search path on the column-protection trigger functions.
alter function public.protect_profile_columns() set search_path = public;
alter function public.protect_restaurant_columns() set search_path = public;

-- ===== 0009_founding_partner =====
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
