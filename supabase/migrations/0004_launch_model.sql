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
