// Verifies a LIVE (test-mode) setup end to end without placing any order or changing data.
// Run:  npm run live:check      (reads .env.local)
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const results = [];
const ok = (name, detail = '') => results.push(['PASS', name, detail]);
const bad = (name, detail = '') => results.push(['FAIL', name, detail]);
const env = (k) => (process.env[k] ?? '').trim();

if (env('APP_MODE') === 'live') ok('APP_MODE=live'); else bad('APP_MODE=live', `currently "${env('APP_MODE') || 'unset'}"`);

// ---- Supabase
const url = env('NEXT_PUBLIC_SUPABASE_URL'), anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), svc = env('SUPABASE_SERVICE_ROLE_KEY');
for (const [k, v] of [['NEXT_PUBLIC_SUPABASE_URL', url], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', anon], ['SUPABASE_SERVICE_ROLE_KEY', svc]]) v ? ok(k + ' set') : bad(k + ' set');
if (url && svc) {
  try {
    const db = createClient(url, svc, { auth: { persistSession: false } });
    const tables = ['profiles', 'restaurants', 'menu_items', 'orders', 'memberships', 'platform_settings', 'stripe_events', 'transactions'];
    for (const t of tables) { const { error } = await db.from(t).select('*', { head: true, count: 'exact' }).limit(1); error ? bad(`table ${t}`, error.message) : ok(`table ${t}`); }
    const { data } = await db.from('platform_settings').select('*').eq('id', 'main').maybeSingle();
    data ? ok('platform settings row', `delivery ${data.commission_delivery_bps / 100}% / collection ${data.commission_collection_bps / 100}% / Plus £${(data.membership_price_pence / 100).toFixed(2)}`) : bad('platform settings row', 'missing — did the setup SQL run?');
    const b = await db.storage.getBucket(env('SUPABASE_STORAGE_BUCKET') || 'menu-images'); b.error ? bad('storage bucket', b.error.message) : ok('storage bucket');
    const { count } = await db.from('profiles').select('*', { head: true, count: 'exact' }).eq('role', 'admin');
    (count ?? 0) > 0 ? ok('admin account exists') : bad('admin account exists', "register on the site, then: update profiles set role='admin' where email='YOU';");
  } catch (e) { bad('Supabase connection', e.message); }
}
// ---- Stripe
const sk = env('STRIPE_SECRET_KEY');
if (!/^sk_(test|live)_[A-Za-z0-9]{16,}$/.test(sk)) bad('STRIPE_SECRET_KEY looks real', 'empty or a placeholder');
else {
  sk.startsWith('sk_test_') ? ok('Stripe is in TEST mode') : bad('Stripe is in TEST mode', 'a LIVE key is set — use test keys until legal/finance sign-off');
  try {
    const stripe = new Stripe(sk);
    await stripe.balance.retrieve(); ok('Stripe API reachable');
    try { const me = await stripe.accounts.retrieve(); ok('Stripe account for these keys', `${me.id}${me.settings?.dashboard?.display_name ? ' (' + me.settings.dashboard.display_name + ')' : ''}`); } catch (e) { bad('Stripe account id', e.message); }
    try { await stripe.accounts.list({ limit: 1 }); ok('Stripe Connect enabled'); } catch (e) { bad('Stripe Connect enabled', e.message); }
    const wh = await stripe.webhookEndpoints.list({ limit: 20 });
    const mine = wh.data.find((w) => /\/api\/stripe\/webhook$/.test(w.url));
    mine ? ok('Webhook endpoint registered', `${mine.url} (${mine.enabled_events.length} events, connect=${!!mine.application || 'check "connected accounts" option'})`) : bad('Webhook endpoint registered', 'none pointing at /api/stripe/webhook yet (needs the live site URL)');
    const pid = env('STRIPE_MEMBERSHIP_PRICE_ID');
    if (pid) { try { const p = await stripe.prices.retrieve(pid); p.unit_amount === 499 && p.recurring?.interval === 'month' ? ok('Membership price £4.99/month') : bad('Membership price', `unit_amount=${p.unit_amount} interval=${p.recurring?.interval}`); } catch (e) { bad('Membership price id', e.message); } }
    else ok('Membership price', 'no STRIPE_MEMBERSHIP_PRICE_ID: price is created inline from the admin setting');
  } catch (e) { bad('Stripe API reachable', e.message); }
}
env('STRIPE_WEBHOOK_SECRET').startsWith('whsec_') ? ok('STRIPE_WEBHOOK_SECRET set') : bad('STRIPE_WEBHOOK_SECRET set', 'add after creating the webhook endpoint');
env('RESEND_API_KEY') ? ok('Email provider key set') : ok('Email provider', 'not configured — emails will be logged as "skipped" (fine for now)');

for (const [s, n, d] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
const fails = results.filter((r) => r[0] === 'FAIL').length;
console.log(fails ? `\n${fails} check(s) need attention.` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
