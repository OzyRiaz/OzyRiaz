-- BD Feast schema. All money is integer pence (GBP). Run via `supabase db push` or the SQL editor.
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
  'Exclusive offers set by restaurants and BD Feast',
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
