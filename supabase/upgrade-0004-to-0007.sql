-- FeastQuarter: apply migrations 0004-0007 to an EXISTING project. Additive and safe to re-run. Paste into Supabase > SQL Editor > New query > Run.

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
