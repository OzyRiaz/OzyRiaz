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
