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
