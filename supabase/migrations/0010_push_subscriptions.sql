-- 0010: phone/browser push notification addresses (web push). Additive and safe to re-run. No existing data is touched.
-- One row per device that has said "yes" to notifications. Written and read only by the server (service role);
-- row level security is on with NO policies, so nothing is reachable from the public API.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
