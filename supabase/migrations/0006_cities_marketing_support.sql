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
